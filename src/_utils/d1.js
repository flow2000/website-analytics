/**
 * D1 数据层：Schema 迁移、settings、sites、daily_stats 快照、reports
 * 约定：daily_stats 以 (domain, date) 为主键，各维度以 JSON 列存储合并后的 {key:{requests..}}
 */

import { buildDailyStats, mapToSortedList } from './cloudflare.js';

const schemaInitCache = new WeakMap();

const SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    zone_id TEXT,
    status TEXT DEFAULT 'active',
    added_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain)`,
  `CREATE TABLE IF NOT EXISTS daily_stats (
    domain TEXT NOT NULL,
    date TEXT NOT NULL,
    requests INTEGER DEFAULT 0, page_views INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0,
    bytes INTEGER DEFAULT 0, threats INTEGER DEFAULT 0,
    cached_requests INTEGER DEFAULT 0, cached_bytes INTEGER DEFAULT 0,
    encrypted_requests INTEGER DEFAULT 0, encrypted_bytes INTEGER DEFAULT 0,
    visits INTEGER DEFAULT 0, waf_events INTEGER DEFAULT 0,
    ip_class TEXT, ssl_protocols TEXT, threat_pathing TEXT,
    countries TEXT, statuses TEXT, content_types TEXT, browsers TEXT, devices TEXT,
    PRIMARY KEY (domain, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL, generated_at TEXT, version TEXT
  )`,
];

/** 幂等初始化表结构（每 isolate 一次） */
export async function ensureSchema(env) {
  if (!env.DB) return;
  if (schemaInitCache.has(env.DB)) return schemaInitCache.get(env.DB);
  const p = (async () => {
    for (const sql of SCHEMA_STMTS) {
      await env.DB.prepare(sql).run();
    }
  })().catch(e => console.error('D1 schema init failed:', e));
  schemaInitCache.set(env.DB, p);
  return p;
}

// ==================== settings ====================

export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, value).run();
}

// ==================== sites ====================

export async function listSites(env) {
  return (await env.DB.prepare('SELECT id, domain, zone_id, status, added_at FROM sites ORDER BY id ASC').all())
    .results || [];
}

export async function upsertSite(env, site) {
  await env.DB.prepare(
    `INSERT INTO sites (domain, zone_id, status) VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET zone_id = excluded.zone_id, status = excluded.status`
  ).bind(site.domain, site.zone_id || null, site.status || 'active').run();
}

export async function removeSite(env, domain) {
  await env.DB.prepare('DELETE FROM sites WHERE domain = ?').bind(domain).run();
}

// ==================== daily_stats ====================

/** 将 GraphQL 1dGroups 的单个 group 归一化为快照行 */
export function groupToRow(domain, group) {
  const s = group.sum || {};
  const u = group.uniq || {};
  const mapToObj = arr => {
    const o = {};
    for (const item of arr || []) {
      const k = item.clientCountryName ?? item.edgeResponseStatus ?? item.edgeResponseContentTypeName
        ?? item.uaBrowserFamily ?? item.ipType ?? item.clientSSLProtocol ?? item.threatPathingName;
      if (k === null || k === undefined) continue;
      o[k] = { requests: item.requests || 0, bytes: item.bytes || 0, pageViews: item.pageViews || 0, threats: item.threats || 0 };
    }
    return o;
  };
  return {
    domain,
    date: group.dimensions && group.dimensions.date,
    requests: s.requests || 0,
    page_views: s.pageViews || 0,
    uniques: u.uniques || 0,
    bytes: s.bytes || 0,
    threats: s.threats || 0,
    cached_requests: s.cachedRequests || 0,
    cached_bytes: s.cachedBytes || 0,
    encrypted_requests: s.encryptedRequests || 0,
    encrypted_bytes: s.encryptedBytes || 0,
    countries: JSON.stringify(mapToObj(s.countryMap)),
    statuses: JSON.stringify(mapToObj(s.responseStatusMap)),
    content_types: JSON.stringify(mapToObj(s.contentTypeMap)),
    browsers: JSON.stringify(mapToObj(s.browserMap)),
    ip_class: JSON.stringify(mapToObj(s.ipClassMap)),
    ssl_protocols: JSON.stringify(mapToObj(s.clientSSLMap)),
    threat_pathing: JSON.stringify(mapToObj(s.threatPathingMap)),
  };
}

export async function upsertDailyRows(env, rows) {
  for (const r of rows) {
    if (!r.date) continue;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO daily_stats (
        domain, date, requests, page_views, uniques, bytes, threats,
        cached_requests, cached_bytes, encrypted_requests, encrypted_bytes,
        visits, waf_events, ip_class, ssl_protocols, threat_pathing,
        countries, statuses, content_types, browsers, devices
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      r.domain, r.date, r.requests || 0, r.page_views || 0, r.uniques || 0, r.bytes || 0, r.threats || 0,
      r.cached_requests || 0, r.cached_bytes || 0, r.encrypted_requests || 0, r.encrypted_bytes || 0,
      r.visits || 0, r.waf_events || 0,
      r.ip_class || null, r.ssl_protocols || null, r.threat_pathing || null,
      r.countries || null, r.statuses || null, r.content_types || null, r.browsers || null, r.devices || null
    ).run();
  }
}

/** 更新快照中的 visits / waf 字段（cron 补采） */
export async function patchVisitsWaf(env, domain, date, values) {
  await env.DB.prepare(
    'UPDATE daily_stats SET visits = ?, waf_events = ? WHERE domain = ? AND date = ?'
  ).bind(values.visits || 0, values.wafEvents || 0, domain, date).run();
}

export async function getDailyRows(env, domains, startDate, endDate) {
  const rows = [];
  // 分批确保参数数量安全
  for (let i = 0; i < domains.length; i += 20) {
    const chunk = domains.slice(i, i + 20);
    const placeholders = chunk.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `SELECT * FROM daily_stats WHERE domain IN (${placeholders}) AND date >= ? AND date <= ?`
    ).bind(...chunk, startDate, endDate).all();
    rows.push(...(res.results || []));
  }
  return rows;
}

/** 将一行快照重建为 buildDailyStats 可消费的 group 形态 */
export function groupFromRow(row) {
  const parse = json => {
    try { return Object.entries(JSON.parse(json || '{}')); } catch { return []; }
  };
  const toEntries = (json, keyName) => parse(json).map(([k, v]) => ({ [keyName]: k, ...(v || {}) }));
  return {
    dimensions: { date: row.date },
    sum: {
      requests: row.requests || 0,
      pageViews: row.page_views || 0,
      bytes: row.bytes || 0,
      threats: row.threats || 0,
      cachedRequests: row.cached_requests || 0,
      cachedBytes: row.cached_bytes || 0,
      encryptedRequests: row.encrypted_requests || 0,
      encryptedBytes: row.encrypted_bytes || 0,
      countryMap: toEntries(row.countries, 'clientCountryName'),
      responseStatusMap: toEntries(row.statuses, 'edgeResponseStatus'),
      contentTypeMap: toEntries(row.content_types, 'edgeResponseContentTypeName'),
      browserMap: toEntries(row.browsers, 'uaBrowserFamily'),
      ipClassMap: toEntries(row.ip_class, 'ipType'),
      clientSSLMap: toEntries(row.ssl_protocols, 'clientSSLProtocol'),
      threatPathingMap: toEntries(row.threat_pathing, 'threatPathingName'),
    },
    uniq: { uniques: row.uniques || 0 },
    _visits: row.visits || 0,
    _waf: row.waf_events || 0,
  };
}

/**
 * 由 D1 快照行构建统计结果（复用 buildDailyStats 口径）
 * @param {Array} sites - [{domain, zone_id}]
 * @param {Array} rows - d1.getDailyRows 结果
 * @returns {object} { totals, trend, breakdowns, perSite, dates }
 */
export function buildStatsFromRows(sites, rows) {
  const rowsByDomain = new Map();
  for (const r of rows) {
    if (!rowsByDomain.has(r.domain)) rowsByDomain.set(r.domain, []);
    rowsByDomain.get(r.domain).push(r);
  }
  const zoneNameById = new Map(sites.map(s => [s.zone_id, s.domain]));
  const zoneResults = sites.map(s => ({
    zoneTag: s.zone_id,
    httpRequests1dGroups: (rowsByDomain.get(s.domain) || []).map(groupFromRow),
  }));

  const stats = buildDailyStats(zoneResults, zoneNameById);

  // 补 visits / waf 总量（D1 快照列）
  const visitMap = {}, wafMap = {};
  let visits = 0, wafEvents = 0;
  for (const r of rows) {
    visits += r.visits || 0;
    wafEvents += r.waf_events || 0;
    visitMap[r.domain] = (visitMap[r.domain] || 0) + (r.visits || 0);
    wafMap[r.domain] = (wafMap[r.domain] || 0) + (r.waf_events || 0);
  }
  stats.totals.visits = visits;
  stats.totals.wafEvents = wafEvents;
  for (const site of stats.perSite) {
    site.totals.visits = visitMap[site.name] || 0;
    site.totals.wafEvents = wafMap[site.name] || 0;
  }
  return stats;
}

// ==================== reports ====================

export async function getLatestReport(env) {
  return env.DB.prepare(
    'SELECT id, payload, generated_at, version FROM reports ORDER BY id DESC LIMIT 1'
  ).first();
}

export async function setLatestReport(env, payloadObj) {
  await ensureSchema(env);
  const payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
  const meta = { generatedAt: payloadObj && payloadObj.generatedAt || new Date().toISOString(), version: payloadObj && payloadObj.version || '3.0' };
  await env.DB.prepare(
    "INSERT INTO reports (payload, generated_at, version) VALUES (?, ?, ?)"
  ).bind(payload, meta.generatedAt, meta.version).run();
}
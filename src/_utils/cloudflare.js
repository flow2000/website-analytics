/**
 * Cloudflare Analytics 数据层（Workers 版，移植自 main api/_utils/cloudflare.js）
 *
 * - GraphQL Analytics API 客户端与查询
 * - REST Zones API（站点解析）
 * - 数据聚合 / 归一化工具
 *
 * 数据集：
 * - httpRequests1dGroups   按日聚合（含国家/状态码/内容类型/浏览器/来源IP类/TLS版本/威胁细分）
 * - httpRequests1hGroups   按小时聚合（今日视图）
 * - httpRequestsAdaptiveGroups 自适应采样（设备类型 / Visits 会话数）
 * - firewallEventsAdaptiveGroups 防火墙(WAF)拦截事件
 */

export const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
export const REST_BASE = 'https://api.cloudflare.com/client/v4';

function getApiToken(env) {
  return env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '';
}

export function getAccountId(env) {
  return env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '';
}

/**
 * 调用 Cloudflare GraphQL API
 * @returns {Promise<object>} data 节点
 */
export async function graphqlRequest(env, query, variables) {
  const token = getApiToken(env);
  if (!token) throw new Error('未配置 CLOUDFLARE_API_TOKEN 环境变量');

  let res;
  try {
    res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    });
  } catch (e) {
    throw new Error('Cloudflare API 网络请求失败: ' + e.message);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (_) {
    throw new Error(`Cloudflare API 返回非 JSON 响应（HTTP ${res.status}）`);
  }

  if (payload.errors && payload.errors.length) {
    throw new Error('GraphQL 查询错误: ' + payload.errors.map(e => e.message).join('; '));
  }
  if (!res.ok) {
    throw new Error(`Cloudflare API HTTP ${res.status}: ` + JSON.stringify(payload.messages || payload).slice(0, 300));
  }
  if (!payload.data) throw new Error('Cloudflare API 返回空数据');
  return payload.data;
}

/** 通过 REST /zones?name= 解析站点（Token 需 Zone Read 权限；GraphQL 不支持 zoneName 过滤） */
export async function resolveZonesByNames(env, names) {
  if (!names || !names.length) return [];
  const token = getApiToken(env);
  if (!token) throw new Error('未配置 CLOUDFLARE_API_TOKEN 环境变量');

  const zones = [];
  for (const name of names) {
    const url = new URL(REST_BASE + '/zones');
    url.searchParams.set('name', name);
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.success === false) continue;
    const z = (payload.result || [])[0];
    if (z) zones.push({ name: z.name, zoneId: z.id });
  }
  return zones;
}

/** 通过 REST /zones 列出全部站点 */
export async function listZonesViaRest(env) {
  const token = getApiToken(env);
  if (!token) throw new Error('未配置 CLOUDFLARE_API_TOKEN 环境变量');
  const accountId = getAccountId(env);

  const zones = [];
  let page = 1;
  for (;;) {
    const url = new URL(REST_BASE + '/zones');
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));
    if (accountId) url.searchParams.set('account.id', accountId);

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.success === false) {
      const msg = payload && payload.errors && payload.errors[0]
        ? payload.errors[0].message
        : `HTTP ${res.status}`;
      throw new Error('获取站点列表失败（REST /zones）: ' + msg);
    }
    for (const z of payload.result || []) {
      zones.push({ name: z.name, zoneId: z.id, status: z.status || '', plan: (z.plan && z.plan.name) || '' });
    }
    const totalPages = (payload.result_info && payload.result_info.total_pages) || page;
    if (page >= totalPages) break;
    page += 1;
  }
  return zones;
}

// ==================== GraphQL 查询 ====================

/** 按日聚合（含全部维度），一次最多 10 个 zone */
export const Q_DAILY = `
query ZoneDailyGroups($zoneTags: [string!], $dateGeq: Date, $dateLeq: Date) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequests1dGroups(
        limit: 100
        filter: { date_geq: $dateGeq, date_leq: $dateLeq }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum {
          requests
          pageViews
          bytes
          threats
          cachedBytes
          cachedRequests
          encryptedBytes
          encryptedRequests
          countryMap { clientCountryName requests bytes threats }
          responseStatusMap { edgeResponseStatus requests }
          contentTypeMap { edgeResponseContentTypeName requests bytes }
          browserMap { uaBrowserFamily pageViews }
          ipClassMap { ipType requests }
          clientSSLMap { clientSSLProtocol requests }
          threatPathingMap { threatPathingName requests }
        }
        uniq { uniques }
      }
    }
  }
}`;

/** 按小时聚合（今日视图） */
export const Q_HOURLY = `
query ZoneHourlyGroups($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequests1hGroups(
        limit: 48
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
      ) {
        dimensions { datetime }
        sum { requests pageViews bytes threats cachedBytes cachedRequests }
        uniq { uniques }
      }
    }
  }
}`;

/** 设备类型分布（Adaptive 采样，按请求数排序） */
export const Q_DEVICES = `
query ZoneDeviceTypes($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequestsAdaptiveGroups(
        limit: 10
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
        orderBy: [count_DESC]
      ) {
        count
        dimensions { deviceType: clientDeviceType }
      }
    }
  }
}`;

/**
 * 热门页面（Adaptive 采样，按请求数排序 Top N）
 * 注意：httpRequestsAdaptiveGroups 数据集仅提供 count（请求数）与 sum(edgeResponseBytes)，
 * 不提供 pageViews 字段（pageViews 仅存在于 1d/1h 数据集），请求非法字段会导致整条查询失败。
 */
export const Q_TOP_PATHS = `
query ZoneTopPaths($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequestsAdaptiveGroups(
        limit: 10
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
        orderBy: [count_DESC]
      ) {
        count
        dimensions { path: clientRequestPath }
        sum { edgeResponseBytes }
      }
    }
  }
}`;

/** Visits 会话数（Adaptive 采样，按日分组，用于快照回填） */
export const Q_VISITS = `
query ZoneVisitsByDay($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequestsAdaptiveGroups(
        limit: 400
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
      ) {
        count
        dimensions { date }
        sum { visits }
      }
    }
  }
}`;

/** WAF 防火墙拦截事件（Adaptive 采样，按动作分组） */
export const Q_WAF = `
query ZoneFirewallEvents($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      firewallEventsAdaptiveGroups(
        limit: 100
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
      ) {
        count
        dimensions { action }
      }
    }
  }
}`;

/** WAF 拦截事件（按日分组，用于快照回填） */
export const Q_WAF_BY_DATE = `
query ZoneFirewallEventsByDate($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      firewallEventsAdaptiveGroups(
        limit: 400
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
      ) {
        count
        dimensions { date }
      }
    }
  }
}`;

/**
 * 将 zone 列表按每批最多 10 个分组执行 GraphQL 查询
 */
async function runZoneBatched(zones, runBatch) {
  const results = [];
  for (let i = 0; i < zones.length; i += 10) {
    const batch = zones.slice(i, i + 10);
    results.push(...(await runBatch(batch.map(z => z.zoneId))));
  }
  return results;
}

export async function fetchDailyGroups(env, zones, dateGeq, dateLeq) {
  return runZoneBatched(zones, zoneTags =>
    graphqlRequest(env, Q_DAILY, { zoneTags, dateGeq, dateLeq }).then(d => d.viewer.zones || [])
  );
}

export async function fetchHourlyGroups(env, zones, datetimeGeq, datetimeLt) {
  return runZoneBatched(zones, zoneTags =>
    graphqlRequest(env, Q_HOURLY, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
  );
}

/** 查询设备类型（失败静默降级） */
export async function fetchDeviceGroups(env, zones, datetimeGeq, datetimeLt) {
  try {
    return await runZoneBatched(zones, zoneTags =>
      graphqlRequest(env, Q_DEVICES, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
  } catch (e) {
    console.error('设备类型查询失败（已降级）:', e.message);
    return zones.map(z => ({ zoneTag: z.zoneId, httpRequestsAdaptiveGroups: [] }));
  }
}

/** 查询热门页面（跨 zone 合并 Top 10；失败返回空） */
export async function fetchTopPages(env, zones, datetimeGeq, datetimeLt) {
  try {
    const zoneResults = await runZoneBatched(zones, zoneTags =>
      graphqlRequest(env, Q_TOP_PATHS, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
    const merged = {};
    for (const zone of zoneResults) {
      for (const g of zone.httpRequestsAdaptiveGroups || []) {
        const path = g.dimensions && g.dimensions.path;
        if (!path) continue;
        if (!merged[path]) merged[path] = { path, requests: 0, bytes: 0 };
        const m = merged[path];
        m.requests += g.count || 0;
        m.bytes += (g.sum && g.sum.edgeResponseBytes) || 0;
      }
    }
    return Object.values(merged)
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);
  } catch (e) {
    console.error('热门页面查询失败（已降级）:', e.message);
    return [];
  }
}

/** 查询 Visits（按日分组；失败返回空）。返回 { byDay, byZone } */
export async function fetchVisitsByDay(env, zones, datetimeGeq, datetimeLt) {
  try {
    const zoneResults = await runZoneBatched(zones, zoneTags =>
      graphqlRequest(env, Q_VISITS, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
    const byDay = {};
    const byZone = {};
    for (const zone of zoneResults) {
      byZone[zone.zoneTag] = byZone[zone.zoneTag] || {};
      for (const g of zone.httpRequestsAdaptiveGroups || []) {
        const date = g.dimensions && g.dimensions.date;
        if (!date) continue;
        const v = (g.sum && g.sum.visits) || 0;
        byDay[date] = (byDay[date] || 0) + v;
        byZone[zone.zoneTag][date] = (byZone[zone.zoneTag][date] || 0) + v;
      }
    }
    return { byDay, byZone };
  } catch (e) {
    console.error('Visits 查询失败（已降级）:', e.message);
    return { byDay: {}, byZone: {} };
  }
}

/** 查询 WAF 拦截事件（总拦截数 + 按动作分组 + 按 zone 总数；失败返回空） */
export async function fetchFirewallEvents(env, zones, datetimeGeq, datetimeLt) {
  try {
    const zoneResults = await runZoneBatched(zones, zoneTags =>
      graphqlRequest(env, Q_WAF, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
    const byAction = {};
    const byZone = {};
    let total = 0;
    for (const zone of zoneResults) {
      let zTotal = 0;
      for (const g of zone.firewallEventsAdaptiveGroups || []) {
        const c = g.count || 0;
        total += c;
        zTotal += c;
        const action = (g.dimensions && g.dimensions.action) || 'unknown';
        byAction[action] = (byAction[action] || 0) + c;
      }
      byZone[zone.zoneTag] = (byZone[zone.zoneTag] || 0) + zTotal;
    }
    return { total, byAction, byZone };
  } catch (e) {
    console.error('WAF 查询失败（已降级）:', e.message);
    return { total: 0, byAction: {}, byZone: {} };
  }
}

/** 查询 WAF 拦截事件（按日分组，用于快照回填；失败返回空）。返回 { byDay, byZone } */
export async function fetchWafByDay(env, zones, datetimeGeq, datetimeLt) {
  try {
    const zoneResults = await runZoneBatched(zones, zoneTags =>
      graphqlRequest(env, Q_WAF_BY_DATE, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
    const byDay = {};
    const byZone = {};
    for (const zone of zoneResults) {
      byZone[zone.zoneTag] = byZone[zone.zoneTag] || {};
      for (const g of zone.firewallEventsAdaptiveGroups || []) {
        const date = g.dimensions && g.dimensions.date;
        if (!date) continue;
        const c = g.count || 0;
        byDay[date] = (byDay[date] || 0) + c;
        byZone[zone.zoneTag][date] = (byZone[zone.zoneTag][date] || 0) + c;
      }
    }
    return { byDay, byZone };
  } catch (e) {
    console.error('WAF 按日查询失败（已降级）:', e.message);
    return { byDay: {}, byZone: {} };
  }
}

// ==================== 时间工具 ====================

export function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return utcDateStr(d);
}

/** 解析统计范围（UTC 口径，与 Cloudflare 控制台一致） */
export function getRange(range) {
  const today = utcDateStr(new Date());
  if (range === 'today') {
    return { key: 'today', label: '今天 (UTC)', days: 1, start: today, end: today };
  }
  if (range === '30d') {
    return { key: '30d', label: '近30天', days: 30, start: addDays(today, -29), end: today };
  }
  return { key: '7d', label: '近7天', days: 7, start: addDays(today, -6), end: today };
}

// ==================== 聚合与归一化 ====================

export function emptyTotals() {
  return {
    requests: 0, pageViews: 0, uniques: 0, bytes: 0, threats: 0,
    cachedRequests: 0, cachedBytes: 0, uncachedRequests: 0, uncachedBytes: 0,
    encryptedRequests: 0, encryptedBytes: 0,
  };
}

function accumulateGroup(totals, group) {
  const s = group.sum || {};
  const u = group.uniq || {};
  totals.requests += s.requests || 0;
  totals.pageViews += s.pageViews || 0;
  totals.bytes += s.bytes || 0;
  totals.threats += s.threats || 0;
  totals.cachedRequests += s.cachedRequests || 0;
  totals.cachedBytes += s.cachedBytes || 0;
  totals.encryptedRequests += s.encryptedRequests || 0;
  totals.encryptedBytes += s.encryptedBytes || 0;
  totals.uniques += u.uniques || 0;
}

export function finalizeTotals(totals) {
  const t = { ...totals };
  t.uncachedRequests = Math.max(0, t.requests - t.cachedRequests);
  t.uncachedBytes = Math.max(0, t.bytes - t.cachedBytes);
  t.cacheHitRate = t.requests > 0 ? Math.round((t.cachedRequests / t.requests) * 1000) / 10 : 0;
  t.encryptedRate = t.requests > 0 ? Math.round((t.encryptedRequests / t.requests) * 1000) / 10 : 0;
  return t;
}

/** 通用嵌套 Map 合并 */
function mergeNestedMap(target, group, field, keyOf) {
  const arr = (group.sum && group.sum[field]) || [];
  for (const item of arr) {
    const key = keyOf(item);
    if (key === null || key === undefined || key === '') continue;
    if (!target[key]) target[key] = { requests: 0, bytes: 0, pageViews: 0, threats: 0 };
    const t = target[key];
    t.requests += item.requests || 0;
    t.bytes += item.bytes || 0;
    t.pageViews += item.pageViews || 0;
    t.threats += item.threats || 0;
  }
}

export function mapToSortedList(obj, keyName, extraKeys) {
  return Object.entries(obj || {})
    .map(([key, v]) => {
      const row = { [keyName]: key };
      for (const k of extraKeys) row[k] = v[k] || 0;
      return row;
    })
    .sort((a, b) => (b.requests || b.pageViews || 0) - (a.requests || a.pageViews || 0));
}

/** 由按日聚合的原始 zoneResults 构建统计结果（含新增维度） */
export function buildDailyStats(zoneResults, zoneNameById) {
  const grandTotals = emptyTotals();
  const grandTrend = new Map();
  const grandCountries = {};
  const grandStatuses = {};
  const grandContentTypes = {};
  const grandBrowsers = {};
  const grandIpClasses = {};
  const grandSslProtocols = {};
  const grandThreatPathing = {};
  const perSite = [];

  for (const zone of zoneResults) {
    const groups = zone.httpRequests1dGroups || [];
    const zoneName = zoneNameById.get(zone.zoneTag) || zone.zoneTag;
    const zoneTotals = emptyTotals();
    const zoneTrend = [];

    for (const group of groups) {
      accumulateGroup(zoneTotals, group);
      const date = group.dimensions && group.dimensions.date;
      if (date) {
        if (!grandTrend.has(date)) {
          grandTrend.set(date, { date, requests: 0, pageViews: 0, uniques: 0, bytes: 0, threats: 0 });
        }
        const t = grandTrend.get(date);
        t.requests += (group.sum && group.sum.requests) || 0;
        t.pageViews += (group.sum && group.sum.pageViews) || 0;
        t.bytes += (group.sum && group.sum.bytes) || 0;
        t.threats += (group.sum && group.sum.threats) || 0;
        t.uniques += (group.uniq && group.uniq.uniques) || 0;

        zoneTrend.push({
          date,
          requests: (group.sum && group.sum.requests) || 0,
          pageViews: (group.sum && group.sum.pageViews) || 0,
          uniques: (group.uniq && group.uniq.uniques) || 0,
          bytes: (group.sum && group.sum.bytes) || 0,
          threats: (group.sum && group.sum.threats) || 0,
        });
      }
      mergeNestedMap(grandCountries, group, 'countryMap', i => i.clientCountryName);
      mergeNestedMap(grandStatuses, group, 'responseStatusMap', i => i.edgeResponseStatus);
      mergeNestedMap(grandContentTypes, group, 'contentTypeMap', i => i.edgeResponseContentTypeName);
      mergeNestedMap(grandBrowsers, group, 'browserMap', i => i.uaBrowserFamily);
      mergeNestedMap(grandIpClasses, group, 'ipClassMap', i => i.ipType);
      mergeNestedMap(grandSslProtocols, group, 'clientSSLMap', i => i.clientSSLProtocol);
      mergeNestedMap(grandThreatPathing, group, 'threatPathingMap', i => i.threatPathingName);
    }

    accumulateGroup(grandTotals, { sum: zoneTotals, uniq: { uniques: zoneTotals.uniques } });
    perSite.push({
      name: zoneName,
      zoneId: zone.zoneTag,
      totals: finalizeTotals(zoneTotals),
      trend: zoneTrend,
    });
  }

  return {
    totals: finalizeTotals(grandTotals),
    trend: Array.from(grandTrend.values()).sort((a, b) => a.date.localeCompare(b.date)),
    breakdowns: {
      countries: mapToSortedList(grandCountries, 'code', ['requests', 'bytes', 'threats']),
      statuses: mapToSortedList(grandStatuses, 'status', ['requests']),
      contentTypes: mapToSortedList(grandContentTypes, 'name', ['requests', 'bytes']),
      browsers: mapToSortedList(grandBrowsers, 'name', ['pageViews']),
      ipClasses: mapToSortedList(grandIpClasses, 'name', ['requests']),
      sslProtocols: mapToSortedList(grandSslProtocols, 'name', ['requests']),
      threatPathing: mapToSortedList(grandThreatPathing, 'name', ['requests']),
    },
    perSite,
  };
}

/** 由按小时聚合数据构建小时趋势（今日视图） */
export function buildHourlyTrend(zoneResults) {
  const merged = new Map();
  for (const zone of zoneResults) {
    for (const group of zone.httpRequests1hGroups || []) {
      const dt = group.dimensions && group.dimensions.datetime;
      if (!dt) continue;
      if (!merged.has(dt)) {
        merged.set(dt, { datetime: dt, requests: 0, pageViews: 0, uniques: 0, bytes: 0, threats: 0 });
      }
      const t = merged.get(dt);
      const s = group.sum || {};
      t.requests += s.requests || 0;
      t.pageViews += s.pageViews || 0;
      t.bytes += s.bytes || 0;
      t.threats += s.threats || 0;
      t.uniques += (group.uniq && group.uniq.uniques) || 0;
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.datetime.localeCompare(b.datetime));
}

/** 由设备类型原始 zoneResults 构建分布数组 */
export function buildDeviceStats(zoneResults) {
  const merged = {};
  for (const zone of zoneResults) {
    for (const group of zone.httpRequestsAdaptiveGroups || []) {
      const type = group.dimensions && group.dimensions.deviceType;
      if (!type) continue;
      merged[type] = (merged[type] || 0) + (group.count || 0);
    }
  }
  return Object.entries(merged)
    .map(([type, requests]) => ({ type, requests }))
    .sort((a, b) => b.requests - a.requests);
}

/** 展平按日原始数据为 CSV 行（复用 main 结构并追加 visits/waf） */
export function flattenDailyRows(zoneName, groups, visitsByDate, wafByDate) {
  const rows = [];
  for (const group of groups || []) {
    const s = group.sum || {};
    const u = group.uniq || {};
    const date = group.dimensions && group.dimensions.date;
    rows.push({
      site: zoneName,
      date,
      requests: s.requests || 0,
      pageViews: s.pageViews || 0,
      uniques: u.uniques || 0,
      bytes: s.bytes || 0,
      cachedRequests: s.cachedRequests || 0,
      cachedBytes: s.cachedBytes || 0,
      uncachedRequests: Math.max(0, (s.requests || 0) - (s.cachedRequests || 0)),
      threats: s.threats || 0,
      encryptedRequests: s.encryptedRequests || 0,
      visits: (visitsByDate && visitsByDate[date]) || 0,
      wafEvents: (wafByDate && wafByDate[date]) || 0,
    });
  }
  return rows;
}
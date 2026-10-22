/**
 * Cloudflare Analytics 数据层
 *
 * - GraphQL Analytics API 客户端与查询（https://developers.cloudflare.com/analytics/graphql-api/）
 * - REST Zones API（站点列表）
 * - 数据聚合 / 归一化工具（供 API 与本地测试服务器共用）
 *
 * 核心数据集：
 * - httpRequests1dGroups      按日聚合：总量、缓存、加密、国家/状态码/内容类型/浏览器分布
 * - httpRequests1hGroups      按小时聚合：用于「今天」视图
 * - httpRequestsAdaptiveGroups 自适应采样：设备类型等维度（单次查询时间跨度有限制）
 */

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const REST_BASE = 'https://api.cloudflare.com/client/v4';

// ==================== 基础请求 ====================

function getApiToken() {
  return process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
}

/**
 * 调用 Cloudflare GraphQL API
 * @returns {Promise<object>} data 节点
 */
async function graphqlRequest(query, variables) {
  const token = getApiToken();
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

function escapeGqlString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ==================== 站点列表 ====================

function applyZoneWhitelist(zones, whitelist) {
  if (!whitelist || !whitelist.length) return zones;
  const set = new Set(whitelist.map(s => s.toLowerCase()));
  return zones.filter(z => set.has(String(z.name).toLowerCase()));
}

/** 通过 REST /zones 列出站点（需要 Zone → Zone → Read 权限） */
async function listZonesViaRest(accountId) {
  const token = getApiToken();
  if (!token) throw new Error('未配置 CLOUDFLARE_API_TOKEN 环境变量');

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
      zones.push({
        name: z.name,
        zoneId: z.id,
        status: z.status || '',
        plan: (z.plan && z.plan.name) || '',
      });
    }

    const totalPages = (payload.result_info && payload.result_info.total_pages) || page;
    if (page >= totalPages) break;
    page += 1;
  }
  return zones;
}

/** 通过 GraphQL zoneName 过滤解析站点（仅需 Zone → Analytics → Read 权限） */
async function listZonesViaGraphql(names) {
  const aliases = names
    .map((n, i) => `z${i}: zones(filter: { zoneName: "${escapeGqlString(n)}" }) { zoneTag }`)
    .join(' ');
  const query = `query ResolveZones { viewer { ${aliases} } }`;
  const data = await graphqlRequest(query, {});
  const nodes = data.viewer.zones || {};

  const zones = [];
  names.forEach((name, i) => {
    const arr = nodes[`z${i}`] || [];
    if (arr[0] && arr[0].zoneTag) {
      zones.push({ name, zoneId: arr[0].zoneTag, status: 'active', plan: '' });
    }
  });
  return zones;
}

/**
 * 列出 Token 可访问的站点
 * - 配置了 CF_ZONES 白名单 → 按名称经 GraphQL 解析（Token 无需 Zone Read 权限）
 * - 否则 → REST /zones 自动发现
 */
async function listZones(config) {
  let zones;
  if (config.zoneWhitelist && config.zoneWhitelist.length) {
    zones = await listZonesViaGraphql(config.zoneWhitelist);
  } else {
    zones = await listZonesViaRest(config.accountId);
    zones = applyZoneWhitelist(zones, config.zoneWhitelist);
  }
  return zones;
}

// ==================== GraphQL 查询 ====================

/** 按日聚合（含国家/状态码/内容类型/浏览器分布），一次最多 10 个 zone */
const Q_DAILY = `
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
        }
        uniq { uniques }
      }
    }
  }
}`;

/** 按小时聚合（「今天」视图） */
const Q_HOURLY = `
query ZoneHourlyGroups($zoneTags: [string!], $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequests1hGroups(
        limit: 48
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
        orderBy: [datetimeHour_ASC]
      ) {
        dimensions { datetimeHour }
        sum { requests pageViews bytes threats cachedBytes cachedRequests }
        uniq { uniques }
      }
    }
  }
}`;

/** 设备类型分布（Adaptive 采样，窗口需 ≤ maxDuration） */
const Q_DEVICES = `
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
 * 将 zone 列表按每批最多 10 个分组执行 GraphQL 查询
 * @param {Function} runBatch (zoneTags: string[]) => Promise<zoneResults>
 */
async function runZoneBatched(zones, runBatch) {
  const results = [];
  for (let i = 0; i < zones.length; i += 10) {
    const batch = zones.slice(i, i + 10);
    const zoneResults = await runBatch(batch.map(z => z.zoneId));
    results.push(...zoneResults);
  }
  return results;
}

/** 查询按日聚合数据（自动分批），返回原始 zoneResults */
async function fetchDailyGroups(zones, dateGeq, dateLeq) {
  return runZoneBatched(zones, zoneTags =>
    graphqlRequest(Q_DAILY, { zoneTags, dateGeq, dateLeq }).then(d => d.viewer.zones || [])
  );
}

/** 查询按小时聚合数据（自动分批） */
async function fetchHourlyGroups(zones, datetimeGeq, datetimeLt) {
  return runZoneBatched(zones, zoneTags =>
    graphqlRequest(Q_HOURLY, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
  );
}

/** 查询设备类型分布（自动分批，失败时静默降级为空数组） */
async function fetchDeviceGroups(zones, datetimeGeq, datetimeLt) {
  try {
    return await runZoneBatched(zones, zoneTags =>
      graphqlRequest(Q_DEVICES, { zoneTags, datetimeGeq, datetimeLt }).then(d => d.viewer.zones || [])
    );
  } catch (e) {
    console.error('设备类型查询失败（已降级）:', e.message);
    return zones.map(zoneId => ({ zoneTag: zoneId, httpRequestsAdaptiveGroups: [] }));
  }
}

// ==================== 时间工具 ====================

function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return utcDateStr(d);
}

/**
 * 解析统计范围
 * 日期口径与 Cloudflare 一致，使用 UTC 日期（「今天」为 UTC 当天，含未结束的部分数据）
 */
function getRange(range) {
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

function emptyTotals() {
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

function finalizeTotals(totals) {
  const t = { ...totals };
  t.uncachedRequests = Math.max(0, t.requests - t.cachedRequests);
  t.uncachedBytes = Math.max(0, t.bytes - t.cachedBytes);
  t.cacheHitRate = t.requests > 0 ? Math.round((t.cachedRequests / t.requests) * 1000) / 10 : 0;
  t.encryptedRate = t.requests > 0 ? Math.round((t.encryptedRequests / t.requests) * 1000) / 10 : 0;
  return t;
}

/** 通用嵌套 Map 合并（countryMap / responseStatusMap / contentTypeMap / browserMap） */
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

function mapToSortedList(obj, keyName, extraKeys) {
  return Object.entries(obj)
    .map(([key, v]) => {
      const row = { [keyName]: key };
      for (const k of extraKeys) row[k] = v[k] || 0;
      return row;
    })
    .sort((a, b) => (b.requests || b.pageViews || 0) - (a.requests || a.pageViews || 0));
}

/**
 * 由按日聚合的原始 zoneResults 构建统计结果
 * @param {Array} zoneResults - [{ zoneTag, httpRequests1dGroups: [...] }]
 * @param {Map} zoneNameById - zoneTag → 站点名
 */
function buildDailyStats(zoneResults, zoneNameById) {
  const grandTotals = emptyTotals();
  const grandTrend = new Map();
  const grandCountries = {};
  const grandStatuses = {};
  const grandContentTypes = {};
  const grandBrowsers = {};
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
    },
    perSite,
  };
}

/** 由按小时聚合的原始 zoneResults 构建小时趋势（今天视图） */
function buildHourlyTrend(zoneResults) {
  const merged = new Map();
  for (const zone of zoneResults) {
    for (const group of zone.httpRequests1hGroups || []) {
      const dt = group.dimensions && group.dimensions.datetimeHour;
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
function buildDeviceStats(zoneResults) {
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

/** 展平按日原始数据为 CSV 行（供导出） */
function flattenDailyRows(zoneName, groups) {
  const rows = [];
  for (const group of groups || []) {
    const s = group.sum || {};
    const u = group.uniq || {};
    rows.push({
      site: zoneName,
      date: group.dimensions && group.dimensions.date,
      requests: s.requests || 0,
      pageViews: s.pageViews || 0,
      uniques: u.uniques || 0,
      bytes: s.bytes || 0,
      cachedRequests: s.cachedRequests || 0,
      cachedBytes: s.cachedBytes || 0,
      uncachedRequests: Math.max(0, (s.requests || 0) - (s.cachedRequests || 0)),
      threats: s.threats || 0,
      encryptedRequests: s.encryptedRequests || 0,
    });
  }
  return rows;
}

module.exports = {
  GRAPHQL_ENDPOINT,
  graphqlRequest,
  listZones,
  fetchDailyGroups,
  fetchHourlyGroups,
  fetchDeviceGroups,
  getRange,
  utcDateStr,
  addDays,
  buildDailyStats,
  buildHourlyTrend,
  buildDeviceStats,
  flattenDailyRows,
  emptyTotals,
};

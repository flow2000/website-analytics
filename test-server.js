/**
 * 本地开发/测试服务器（零依赖，Node >= 18）
 *
 * 使用与 Cloudflare GraphQL Analytics API 相同结构的 Mock 数据，
 * 走真实的聚合/归一化逻辑，用于本地开发与前端联调：
 *
 *   node test-server.js
 *   # 或 npm run dev
 *   # 打开 http://localhost:3001
 *
 * 无需配置 CLOUDFLARE_API_TOKEN。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const cf = require('./api/_utils/cloudflare');
const { generateCSV } = require('./api/_utils/csv');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ==================== Mock 数据生成 ====================

const MOCK_SITES = [
  { name: 'example.com', zoneId: 'mock-zone-a', status: 'active', plan: 'Free' },
  { name: 'blog.example.com', zoneId: 'mock-zone-b', status: 'active', plan: 'Free' },
  { name: 'docs.example.com', zoneId: 'mock-zone-c', status: 'active', plan: 'Pro' },
];

const COUNTRIES = ['CN', 'US', 'JP', 'HK', 'SG', 'DE', 'GB', 'KR'];
const STATUSES = [200, 200, 200, 200, 301, 304, 404, 403];
const CONTENT_TYPES = ['html', 'png', 'javascript', 'css', 'json', 'font'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Mobile App'];
const DEVICES = [
  { deviceType: 'mobile', weight: 0.52 },
  { deviceType: 'desktop', weight: 0.38 },
  { deviceType: 'tablet', weight: 0.07 },
  { deviceType: 'other', weight: 0.03 },
];

/** 确定性伪随机，保证同一天数据稳定 */
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mockDayGroups(zone, dateStr) {
  const rand = seeded(hashStr(zone.zoneId + dateStr));
  const base = zone.zoneId.endsWith('a') ? 5800 : zone.zoneId.endsWith('b') ? 2900 : 1500;
  const wave = 0.75 + 0.5 * Math.abs(Math.sin(hashStr(dateStr) % 30 / 30 * Math.PI * 2));
  const requests = Math.round(base * wave * (0.85 + rand() * 0.3));
  const pageViews = Math.round(requests * (0.22 + rand() * 0.06));
  const uniques = Math.round(pageViews * (0.42 + rand() * 0.1));
  const cachedRequests = Math.round(requests * (0.82 + rand() * 0.12));

  const sum = {
    requests,
    pageViews,
    bytes: Math.round(requests * (9000 + rand() * 6000)),
    threats: Math.round(rand() * 40),
    cachedBytes: Math.round(requests * 12000 * 0.86),
    cachedRequests,
    encryptedBytes: Math.round(requests * 14000 * 0.97),
    encryptedRequests: Math.round(requests * 0.97),
    countryMap: COUNTRIES.map((code, i) => ({
      clientCountryName: code,
      requests: Math.round(requests * (0.42 / (i + 1)) * (0.7 + rand() * 0.6)),
      bytes: Math.round(requests * 12000 * (0.3 / (i + 1))),
      threats: Math.round(rand() * 20 / (i + 1)),
    })),
    responseStatusMap: STATUSES.map((status, i) => ({
      edgeResponseStatus: status,
      requests: Math.round(requests * (i < 4 ? 0.16 : 0.03) * (0.6 + rand() * 0.8)),
    })),
    contentTypeMap: CONTENT_TYPES.map((name, i) => ({
      edgeResponseContentTypeName: name,
      requests: Math.round(requests * (i === 0 ? 0.24 : 0.16 / (i + 0.4)) * (0.7 + rand() * 0.6)),
      bytes: Math.round(requests * 12000 * (0.3 / (i + 0.6))),
    })),
    browserMap: BROWSERS.map((name, i) => ({
      uaBrowserFamily: name,
      pageViews: Math.round(pageViews * (i === 0 ? 0.55 : 0.3 / i) * (0.7 + rand() * 0.6)),
    })),
  };

  return { dimensions: { date: dateStr }, sum, uniq: { uniques } };
}

function mockHourlyGroups(zone, dayStartIso) {
  const dateStr = dayStartIso.slice(0, 10);
  const hours = new Date().getUTCHours();
  const groups = [];
  for (let h = 0; h <= hours; h++) {
    const rand = seeded(hashStr(zone.zoneId + dateStr + h));
    const wave = 0.4 + 0.8 * Math.abs(Math.sin((h - 2) / 24 * Math.PI));
    const requests = Math.round((zone.zoneId.endsWith('a') ? 240 : 110) * wave * (0.7 + rand() * 0.6));
    groups.push({
      dimensions: { datetimeHour: `${dateStr}T${String(h).padStart(2, '0')}:00:00Z` },
      sum: {
        requests,
        pageViews: Math.round(requests * 0.24),
        bytes: Math.round(requests * 11000),
        threats: Math.round(rand() * 5),
        cachedBytes: Math.round(requests * 9000),
        cachedRequests: Math.round(requests * 0.86),
      },
      uniq: { uniques: Math.round(requests * 0.11) },
    });
  }
  return groups;
}

function mockDeviceGroups(zone) {
  const rand = seeded(hashStr(zone.zoneId + 'devices'));
  const total = zone.zoneId.endsWith('a') ? 52000 : 26000;
  return DEVICES.map(d => ({
    count: Math.round(total * d.weight * (0.85 + rand() * 0.3)),
    dimensions: { deviceType: d.deviceType },
  }));
}

function buildMockDaily(zone) {
  // 由 range 推断日期范围（mock 直接按 30 天生成，由聚合逻辑按实际数据输出）
  const today = cf.utcDateStr(new Date());
  const start = cf.addDays(today, -29);
  const groups = [];
  let d = start;
  while (d <= today) {
    groups.push(mockDayGroups({ zoneId: zone.zoneId }, d));
    d = cf.addDays(d, 1);
  }
  return groups;
}

function zonesFromParam(site) {
  if (!site || site === 'all') return MOCK_SITES;
  return MOCK_SITES.filter(z => z.name === site || z.zoneId === site);
}

// ==================== HTTP 服务 ====================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, obj, status = 200, headers = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, headers));
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/sites') {
      return sendJson(res, { success: true, data: { total: MOCK_SITES.length, sites: MOCK_SITES } });
    }

    if (pathname === '/api/stats') {
      const site = url.searchParams.get('site') || 'all';
      const range = cf.getRange(url.searchParams.get('range') || '7d');
      const zones = zonesFromParam(site);
      if (!zones.length) return sendJson(res, { success: false, message: '站点不存在' }, 404);

      const zoneNameById = new Map(zones.map(z => [z.zoneId, z.name]));
      const generatedAt = new Date().toISOString();

      // 生成 30 天 mock 数据后按 range 过滤，模拟 GraphQL date filter
      const dailyZoneResults = zones.map(z => ({
        zoneTag: z.zoneId,
        httpRequests1dGroups: buildMockDaily(z).filter(g => g.dimensions.date >= range.start && g.dimensions.date <= range.end),
      }));
      const stats = cf.buildDailyStats(dailyZoneResults, zoneNameById);

      let hourly = [];
      if (range.key === 'today') {
        const hourlyZoneResults = zones.map(z => ({ zoneTag: z.zoneId, httpRequests1hGroups: mockHourlyGroups(z, `${range.start}T00:00:00Z`) }));
        hourly = cf.buildHourlyTrend(hourlyZoneResults);
      }

      const deviceZoneResults = zones.map(z => ({ zoneTag: z.zoneId, httpRequestsAdaptiveGroups: mockDeviceGroups(z) }));
      const devices = cf.buildDeviceStats(deviceZoneResults);

      return sendJson(res, {
        success: true,
        data: {
          range: range.key,
          rangeLabel: range.label,
          rangeDays: range.days,
          start: range.start,
          end: range.end,
          trendInterval: range.key === 'today' ? 'hour' : 'day',
          generatedAt,
          sites: zones.map(z => ({ name: z.name, zoneId: z.zoneId })),
          totals: stats.totals,
          trend: range.key === 'today' ? hourly : stats.trend,
          breakdowns: { ...stats.breakdowns, devices, devicesWindowDays: 3 },
          perSite: stats.perSite,
        },
      }, 200, { 'Cache-Control': 'public, max-age=60' });
    }

    if (pathname === '/api/export') {
      const site = url.searchParams.get('site') || 'all';
      const format = url.searchParams.get('format') || 'json';
      const zones = zonesFromParam(site);
      if (!zones.length) return sendJson(res, { success: false, message: '站点不存在' }, 404);

      const today = cf.utcDateStr(new Date());
      const rangeStart = cf.addDays(today, -29);
      const timestamp = Date.now();

      const dailyByZone = new Map(zones.map(z => [z.zoneId, buildMockDaily(z)]));
      const devicesByZone = new Map(zones.map(z => [z.zoneId, mockDeviceGroups(z)]));

      if (format === 'csv') {
        const rows = [];
        for (const z of zones) rows.push(...cf.flattenDailyRows(z.name, dailyByZone.get(z.zoneId)));
        rows.sort((a, b) => (a.site === b.site ? String(a.date).localeCompare(String(b.date)) : a.site.localeCompare(b.site)));
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cloudflare-analytics-export-${timestamp}.csv"`,
        });
        return res.end('\uFEFF' + generateCSV(rows));
      }

      return sendJson(res, {
        exportedAt: new Date().toISOString(),
        source: 'Cloudflare GraphQL Analytics API (mock)',
        queryInfo: {
          dataset: 'httpRequests1dGroups',
          date_geq: rangeStart,
          date_leq: today,
          dateBasis: 'UTC',
        },
        totalSites: zones.length,
        totalRecords: zones.reduce((n, z) => n + dailyByZone.get(z.zoneId).length, 0),
        sites: zones.map(z => ({
          site: z.name,
          zoneId: z.zoneId,
          datasets: {
            httpRequests1dGroups: dailyByZone.get(z.zoneId),
            httpRequestsAdaptiveGroups_deviceTypes: devicesByZone.get(z.zoneId),
          },
        })),
      }, 200, { 'Content-Disposition': `attachment; filename="cloudflare-analytics-export-${timestamp}.json"` });
    }

    // 静态文件
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) filePath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(filePath));
    }

    sendJson(res, { success: false, message: 'Not found: ' + pathname }, 404);
  } catch (e) {
    console.error('test-server error:', e);
    sendJson(res, { success: false, message: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Cloudflare 网站流量分析 · 本地测试服务器（Mock 数据）`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});

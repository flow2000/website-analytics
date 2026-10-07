/**
 * 本地测试服务器
 * 使用 Mock 数据模拟所有 API 接口，无需 MongoDB
 * 用于本地开发和前端测试
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const {
  buildSiteData, buildOverviewData,
  generateSiteAIReport, generateOverviewAI
} = require('./api/_utils/analyzer');

const { generateCSV } = require('./api/_utils/csv');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ========== Mock 数据生成 ==========
function generateMockDay(uv, pv, bounceRate, avgDurationMs, dateStr, beforeDateStr) {
  const bUv = Math.round(uv * 0.9);
  const bPv = Math.round(pv * 0.9);
  return {
    curTime: `${dateStr}-${dateStr}`,
    curUv: uv,
    curPv: pv,
    curSv: Math.round(uv * 1.2),
    curIp: Math.round(uv * 0.8),
    curNewUserCount: Math.round(uv * 0.3),
    curBounceRate: bounceRate,
    curAvgDuration: avgDurationMs,
    beforeTime: `${beforeDateStr}-${beforeDateStr}`,
    beforeUv: bUv,
    beforePv: bPv,
    beforeSv: Math.round(bUv * 1.2),
    beforeIp: Math.round(bUv * 0.8),
    beforeNewUserCount: Math.round(bUv * 0.3),
    beforeBounceRate: bounceRate + 0.02,
    beforeAvgDuration: avgDurationMs - 5000,
    monthUv: uv * 30,
    monthPv: pv * 30,
    monthSv: Math.round(uv * 1.2 * 30),
    monthIp: Math.round(uv * 0.8 * 30),
    monthNewUserCount: Math.round(uv * 0.3 * 30),
    monthBounceRate: bounceRate,
    monthAvgDuration: avgDurationMs,
    totalUv: uv * 365,
    totalPv: pv * 365,
    totalSv: Math.round(uv * 1.2 * 365),
    totalIp: Math.round(uv * 0.8 * 365),
    totalNewUserCount: Math.round(uv * 0.3 * 365),
    totalBounceRate: bounceRate,
    totalAvgDuration: avgDurationMs,
    topUv: Math.round(uv * 2.5),
    topTimeUv: '2026-09-15',
    topNewUserCount: Math.round(uv * 0.3 * 2.5),
    topTimeNewUserCount: '2026-09-15',
    topPv: Math.round(pv * 2.5),
    topTimePv: '2026-09-20',
    topSv: Math.round(uv * 2.5 * 1.2),
    topTimeSv: '2026-09-18',
    topIp: Math.round(uv * 2.5 * 0.8),
    topTimeIp: '2026-09-16',
    topBounceRate: bounceRate * 1.5,
    topTimeBounceRate: '2026-08-01',
    topAvgDuration: avgDurationMs * 1.5,
    topTimeAvgDuration: '2026-07-15'
  };
}

function generateSiteRecords(siteName, days, baseUv, basePv, trend = 'up') {
  const records = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dateSlash = dateStr.replace(/-/g, '/');

    // 前一天日期（用于 beforeTime）
    const beforeDate = new Date(date);
    beforeDate.setDate(beforeDate.getDate() - 1);
    const beforeDateStr = beforeDate.toISOString().split('T')[0].replace(/-/g, '/');

    // 根据趋势生成波动数据
    const progress = (days - i) / days;
    let multiplier = 1;
    if (trend === 'up') multiplier = 0.7 + progress * 0.6;
    else if (trend === 'down') multiplier = 1.3 - progress * 0.6;
    else multiplier = 0.95 + Math.random() * 0.1;

    const uv = Math.round(baseUv * multiplier * (0.95 + Math.random() * 0.1));
    const pv = Math.round(basePv * multiplier * (0.95 + Math.random() * 0.1));
    const bounce = 0.35 + Math.random() * 0.3;
    const duration = 50000 + Math.random() * 50000;

    records.push({
      site: siteName,
      date: dateStr,
      data: generateMockDay(uv, pv, bounce, duration, dateSlash, beforeDateStr)
    });
  }
  return records;
}

// 生成 3 个站点 30 天的 Mock 数据
const MOCK_SITES = [
  { name: 'aqcoder.cn', baseUv: 1200, basePv: 3000, trend: 'up' },
  { name: 'bimg.cc', baseUv: 800, basePv: 1800, trend: 'stable' },
  { name: 'demo.example.com', baseUv: 400, basePv: 900, trend: 'down' }
];

const ALL_RECORDS = [];
for (const site of MOCK_SITES) {
  const records = generateSiteRecords(site.name, 30, site.baseUv, site.basePv, site.trend);
  ALL_RECORDS.push(...records);
}

// ========== API 处理函数 ==========
function jsonResponse(res, data, statusCode = 200, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
    ...extraHeaders
  });
  res.end(body);
}

function success(res, data) {
  jsonResponse(res, { success: true, data });
}

function error(res, message, statusCode = 400) {
  jsonResponse(res, { success: false, message }, statusCode);
}

function getSiteRecords(siteName, days) {
  const siteRecords = ALL_RECORDS.filter(r => r.site === siteName);
  return siteRecords.slice(-days);
}

// GET /api/sites
function handleSites(res) {
  const sites = [...new Set(ALL_RECORDS.map(r => r.site))].sort();
  success(res, {
    total: sites.length,
    sites: sites.map(name => ({ name }))
  });
}

// GET /api/stats
function handleStats(res, query) {
  const site = query.site || '';
  const days = parseInt(query.days, 10) || 7;

  if (site && site !== 'all') {
    const records = getSiteRecords(site, days);
    if (records.length === 0) {
      return error(res, '站点不存在', 404);
    }
    const siteData = buildSiteData(site, records.map(r => ({ date: r.date, data: r.data })));
    return success(res, { days, site: siteData });
  }

  // 总览
  const siteNames = [...new Set(ALL_RECORDS.map(r => r.site))].sort();
  const siteDataList = siteNames.map(name => {
    const records = getSiteRecords(name, days);
    return buildSiteData(name, records.map(r => ({ date: r.date, data: r.data })));
  });
  const overview = buildOverviewData(siteDataList, days);
  success(res, { days, overview, sites: siteDataList });
}

// GET /api/analysis
function handleAnalysis(res, query) {
  const site = query.site || '';
  const days = parseInt(query.days, 10) || 7;
  const generatedAt = new Date().toISOString();
  const filename = `analysis-report-${Date.now()}.json`;

  const meta = {
    version: '2.0',
    generatedAt,
    generator: '51.LA Analytics Engine',
    dataSource: '51.LA Open API V6 (Mock)',
    days
  };

  if (site && site !== 'all') {
    const records = getSiteRecords(site, days);
    if (records.length === 0) {
      return error(res, '站点不存在', 404);
    }
    const siteData = buildSiteData(site, records.map(r => ({ date: r.date, data: r.data })));
    siteData.aiReport = generateSiteAIReport(siteData);
    return jsonResponse(res, {
      success: true,
      data: { ...meta, site: siteData }
    }, 200, {
      'Content-Disposition': `attachment; filename="${filename}"`
    });
  }

  // 总览
  const siteNames = [...new Set(ALL_RECORDS.map(r => r.site))].sort();
  const siteDataList = siteNames.map(name => {
    const records = getSiteRecords(name, days);
    const siteData = buildSiteData(name, records.map(r => ({ date: r.date, data: r.data })));
    siteData.aiReport = generateSiteAIReport(siteData);
    return siteData;
  });
  const overview = buildOverviewData(siteDataList, days);
  const overallAI = generateOverviewAI(siteDataList, overview);

  jsonResponse(res, {
    success: true,
    data: { ...meta, summary: overview, sites: siteDataList, overallAI }
  }, 200, {
    'Content-Disposition': `attachment; filename="${filename}"`
  });
}

// GET /api/export
function handleExport(res, query) {
  const format = (query.format || 'json').toLowerCase();
  const site = query.site || '';
  const days = parseInt(query.days, 10) || 0;

  let records = ALL_RECORDS;
  if (site && site !== 'all') {
    records = records.filter(r => r.site === site);
  }
  if (days > 0) {
    const siteNames = [...new Set(records.map(r => r.site))];
    const filtered = [];
    for (const name of siteNames) {
      const siteRecs = records.filter(r => r.site === name).slice(-days);
      filtered.push(...siteRecs);
    }
    records = filtered;
  }

  records.sort((a, b) => {
    if (a.site !== b.site) return a.site.localeCompare(b.site);
    return a.date.localeCompare(b.date);
  });

  const timestamp = Date.now();

  if (format === 'csv') {
    const csv = generateCSV(records);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-export-${timestamp}.csv"`,
      'Access-Control-Allow-Origin': '*'
    });
    return res.end('\uFEFF' + csv);
  }

  // JSON
  const bySite = {};
  for (const r of records) {
    if (!bySite[r.site]) bySite[r.site] = [];
    bySite[r.site].push({ date: r.date, data: r.data });
  }
  const sites = Object.keys(bySite).map(siteName => ({
    site: siteName,
    recordCount: bySite[siteName].length,
    records: bySite[siteName]
  }));

  const result = {
    exportedAt: new Date().toISOString(),
    source: '51.LA Analytics (Mock)',
    totalSites: sites.length,
    totalRecords: records.length,
    sites
  };

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="analytics-export-${timestamp}.json"`,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(result));
}

// ========== 静态文件服务 ==========
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return error(res, 'Not Found', 404);
      }
      return error(res, 'Internal Server Error', 500);
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

// ========== 主服务器 ==========
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams);

    // CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // API 路由
    if (pathname === '/api/sites') return handleSites(res);
    if (pathname === '/api/stats') return handleStats(res, query);
    if (pathname === '/api/analysis') return handleAnalysis(res, query);
    if (pathname === '/api/export') return handleExport(res, query);

    // 静态文件
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    // 防止路径遍历
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return error(res, 'Forbidden', 403);
    }
    serveStatic(res, filePath);
  } catch (e) {
    console.error('Server error:', e);
    error(res, 'Internal Server Error: ' + e.message, 500);
  }
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 51.LA 分析系统 - 本地测试服务器');
  console.log(`📍 监听端口: ${PORT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('📡 API 接口:');
  console.log('   GET /api/sites       - 站点列表');
  console.log('   GET /api/stats       - 统计数据 (?site=&days=)');
  console.log('   GET /api/analysis    - AI 分析报告 (?site=&days=)');
  console.log('   GET /api/export      - 数据导出 (?format=json|csv&site=&days=)');
  console.log('');
  console.log('📊 Mock 数据:');
  console.log(`   站点数: ${MOCK_SITES.length}`);
  console.log(`   每个站点: 30 天数据`);
  console.log(`   总记录数: ${ALL_RECORDS.length}`);
  MOCK_SITES.forEach(s => console.log(`   - ${s.name} (趋势: ${s.trend})`));
  console.log('');
  console.log('='.repeat(60));
});

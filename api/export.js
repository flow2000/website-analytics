/**
 * GET /api/export?key=密码&format=report&days=14
 * 从 MongoDB 导出数据（带访问密码）
 *
 * 支持的 format:
 *   - json   : 原始数据格式（默认）
 *   - csv    : CSV 表格格式
 *   - report : report.json 格式（含 today/history/quality/compare，不含 AI 分析）
 *              外部 AI 只需添加 aiReport 和 overallAI 字段即可直接推送
 *
 * 参数:
 *   - key    : 访问密码（必需）
 *   - format : json | csv | report（默认 json）
 *   - site   : 指定站点名，留空则全部
 *   - days   : 最近 N 天
 *   - start  : 开始日期 YYYY-MM-DD
 *   - end    : 结束日期 YYYY-MM-DD
 */

const { MongoClient } = require('mongodb');
const { wrapHandler } = require('./_utils/handler');

const EXPORT_KEY = process.env.EXPORT_KEY || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'website_statistics';
const COL_NAME = process.env.MONGODB_COL || '51.la';

let cachedClient = null;

async function getMongoClient() {
  if (cachedClient) return cachedClient;
  if (!MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  cachedClient = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });
  await cachedClient.connect();
  return cachedClient;
}

// ========== 工具函数 ==========

/**
 * 将 51.la 原始数据转换为标准字段
 */
function normalizeData(raw) {
  if (!raw) return null;
  const uv = raw.curUv ?? raw.uv ?? 0;
  const pv = raw.curPv ?? raw.pv ?? 0;
  const sv = raw.curSv ?? raw.sv ?? 0;
  const ip = raw.curIp ?? raw.ip ?? 0;
  const newUser = raw.curNewUserCount ?? raw.newUser ?? raw.newUserCount ?? 0;
  // 51.la 的 bounceRate 是小数（0.45 表示 45%）
  const bounceRate = raw.curBounceRate != null ? raw.curBounceRate * 100 : (raw.bounceRate ?? 0);
  // 51.la 的 avgDuration 是毫秒
  const avgDuration = raw.curAvgDuration != null ? raw.curAvgDuration / 1000 : (raw.avgDuration ?? 0);
  const pvPerUv = uv > 0 ? pv / uv : 0;

  return { uv, pv, sv, ip, newUser, bounceRate, avgDuration, pvPerUv };
}

/**
 * 计算质量等级
 */
function getQualityLevel(type, value) {
  switch (type) {
    case 'bounceRate':
      if (value < 30) return '优秀';
      if (value < 50) return '良好';
      if (value < 70) return '一般';
      return '偏高';
    case 'avgDuration':
      if (value >= 180) return '优秀';
      if (value >= 60) return '良好';
      if (value >= 30) return '一般';
      return '偏短';
    case 'pvPerUv':
      if (value >= 3) return '优秀';
      if (value >= 1.5) return '良好';
      if (value >= 1) return '一般';
      return '待优化';
    default:
      return '未知';
  }
}

/**
 * 计算变化百分比
 */
function calcChange(cur, prev) {
  if (!prev || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/**
 * 计算整体质量评级
 */
function getOverallGrade(quality) {
  const levels = { '优秀': 4, '良好': 3, '一般': 2, '偏高': 1, '偏短': 1, '待优化': 1 };
  const vals = [
    levels[quality.bounceRate?.level] || 0,
    levels[quality.avgDuration?.level] || 0,
    levels[quality.pvPerUv?.level] || 0
  ];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 3.5) return '优秀';
  if (avg >= 2.5) return '良好';
  if (avg >= 1.5) return '一般';
  return '待优化';
}

/**
 * 构建 report 格式数据
 */
function buildReportFormat(sitesData) {
  const sites = [];
  let totalUv = 0, totalPv = 0, totalSv = 0, totalIp = 0, totalNew = 0;
  let bestSite = null, weakestSite = null;

  for (const siteName of Object.keys(sitesData)) {
    const records = sitesData[siteName];
    if (records.length === 0) continue;

    // 按日期排序
    records.sort((a, b) => a.date.localeCompare(b.date));

    const history = records.map(r => {
      const n = normalizeData(r.data);
      return {
        date: r.date,
        uv: n.uv,
        pv: n.pv,
        sv: n.sv,
        ip: n.ip,
        newUser: n.newUser,
        bounceRate: Number(n.bounceRate.toFixed(2)),
        avgDuration: Number(n.avgDuration.toFixed(1)),
        pvPerUv: Number(n.pvPerUv.toFixed(2))
      };
    });

    const today = history[history.length - 1];
    const yesterday = history.length >= 2 ? history[history.length - 2] : null;

    // 计算较昨日变化
    const compare = yesterday ? {
      uvChange: Number(calcChange(today.uv, yesterday.uv)?.toFixed(2) ?? null),
      pvChange: Number(calcChange(today.pv, yesterday.pv)?.toFixed(2) ?? null),
      svChange: Number(calcChange(today.sv, yesterday.sv)?.toFixed(2) ?? null),
      ipChange: Number(calcChange(today.ip, yesterday.ip)?.toFixed(2) ?? null),
      newUserChange: Number(calcChange(today.newUser, yesterday.newUser)?.toFixed(2) ?? null)
    } : {};

    // 质量指标（取最近 3 天平均值更稳定，如果数据不够则取所有）
    const recentDays = history.slice(-Math.min(3, history.length));
    const avgBr = recentDays.reduce((s, d) => s + d.bounceRate, 0) / recentDays.length;
    const avgDur = recentDays.reduce((s, d) => s + d.avgDuration, 0) / recentDays.length;
    const avgPvpu = recentDays.reduce((s, d) => s + d.pvPerUv, 0) / recentDays.length;

    const quality = {
      bounceRate: { value: Number(avgBr.toFixed(1)), level: getQualityLevel('bounceRate', avgBr) },
      avgDuration: { value: Number(avgDur.toFixed(0)), level: getQualityLevel('avgDuration', avgDur) },
      pvPerUv: { value: Number(avgPvpu.toFixed(2)), level: getQualityLevel('pvPerUv', avgPvpu) }
    };

    const overallGrade = getOverallGrade(quality);

    const siteObj = {
      name: siteName,
      overallGrade,
      today,
      compare,
      quality,
      history
    };

    sites.push(siteObj);

    // 汇总
    totalUv += today.uv;
    totalPv += today.pv;
    totalSv += today.sv;
    totalIp += today.ip;
    totalNew += today.newUser;

    // 最佳/最弱站点（按 UV 排名）
    if (!bestSite || today.uv > bestSite.today.uv) {
      bestSite = siteObj;
    }
    if (!weakestSite || today.uv < weakestSite.today.uv) {
      weakestSite = siteObj;
    }
  }

  // 按 UV 降序排列
  sites.sort((a, b) => b.today.uv - a.today.uv);

  const reportDays = sites.length > 0 ? sites[0].history.length : 0;

  const result = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    generator: '51.LA Analytics Export API',
    dataSource: '51.LA Open API V6',
    summary: {
      totalSites: sites.length,
      totalUv,
      totalPv,
      reportDays,
      bestSite: bestSite?.name || '',
      bestGrade: bestSite?.overallGrade || '',
      weakestSite: weakestSite?.name || '',
      weakestGrade: weakestSite?.overallGrade || ''
    },
    sites,
    // 预留 AI 分析位置，外部 AI 直接填充即可
    overallAI: null
  };

  return result;
}

// ========== 主处理 ==========
const handler = wrapHandler(async (event, context) => {
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (method !== 'GET') {
    return errorResp('Method not allowed', 405);
  }

  const query = event.query || event.queryStringParameters || {};

  if (query.key !== EXPORT_KEY) {
    return errorResp('访问密码错误', 403);
  }

  try {
    const format = (query.format || 'json').toLowerCase();
    const site = query.site || '';
    const days = parseInt(query.days, 10) || 0;
    const startDate = query.start || '';
    const endDate = query.end || '';

    const client = await getMongoClient();
    const col = client.db(DB_NAME).collection(COL_NAME);

    const findQuery = {};
    if (site && site !== 'all') {
      findQuery.site = site;
    }

    if (startDate || endDate) {
      findQuery.date = {};
      if (startDate) findQuery.date.$gte = startDate;
      if (endDate) findQuery.date.$lte = endDate;
    } else if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - days + 1);
      findQuery.date = { $gte: d.toISOString().split('T')[0] };
    }

    const records = await col.find(findQuery).sort({ site: 1, date: 1 }).toArray();

    // 按站点分组
    const bySite = {};
    for (const r of records) {
      if (!bySite[r.site]) bySite[r.site] = [];
      bySite[r.site].push({ date: r.date, data: r.data });
    }

    // ===== Report 格式 =====
    if (format === 'report') {
      const report = buildReportFormat(bySite);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="report-data-${Date.now()}.json"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(report, null, 2)
      };
    }

    // ===== CSV 格式 =====
    if (format === 'csv') {
      const csv = generateCSV(records);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="analytics-export-${Date.now()}.csv"`,
          'Access-Control-Allow-Origin': '*'
        },
        body: '\uFEFF' + csv
      };
    }

    // ===== JSON 原始格式（默认）=====
    const sites = Object.keys(bySite).map(siteName => ({
      site: siteName,
      recordCount: bySite[siteName].length,
      records: bySite[siteName]
    }));

    const result = {
      exportedAt: new Date().toISOString(),
      source: '51.LA Analytics',
      totalSites: sites.length,
      totalRecords: records.length,
      sites
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="analytics-export-${Date.now()}.json"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(result)
    };

  } catch (e) {
    console.error('export error:', e);
    return errorResp('导出失败: ' + e.message, 500);
  }
});

function errorResp(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ success: false, message })
  };
}

function generateCSV(records) {
  const headers = ['site', 'date', 'uv', 'pv', 'sv', 'ip', 'newUser', 'bounceRate', 'avgDurationSec', 'pvPerUv'];
  const lines = [headers.join(',')];

  for (const rec of records) {
    const n = normalizeData(rec.data);
    lines.push([
      rec.site,
      rec.date,
      n.uv,
      n.pv,
      n.sv,
      n.ip,
      n.newUser,
      n.bounceRate.toFixed(2) + '%',
      n.avgDuration.toFixed(2),
      n.pvPerUv.toFixed(2)
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = handler;
module.exports.handler = handler;

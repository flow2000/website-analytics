/**
 * GET /api/export?key=密码&format=json&site=xxx&days=7
 * 从 MongoDB 导出数据（带访问密码）
 *
 * 密码从环境变量 EXPORT_KEY 读取，通过 query 参数 key 传入验证
 *
 * format: json | csv
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

  // 解析 query
  const query = event.query || event.queryStringParameters || {};

  // 密码验证
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

    // 构建查询条件
    const findQuery = {};
    if (site && site !== 'all') {
      findQuery.site = site;
    }

    // 日期过滤
    if (startDate || endDate) {
      findQuery.date = {};
      if (startDate) findQuery.date.$gte = startDate;
      if (endDate) findQuery.date.$lte = endDate;
    } else if (days > 0) {
      // 计算 N 天前的日期
      const d = new Date();
      d.setDate(d.getDate() - days + 1);
      findQuery.date = { $gte: d.toISOString().split('T')[0] };
    }

    // 查询数据
    const records = await col.find(findQuery).sort({ site: 1, date: 1 }).toArray();

    // 按站点分组
    const bySite = {};
    for (const r of records) {
      if (!bySite[r.site]) bySite[r.site] = [];
      bySite[r.site].push({
        date: r.date,
        data: r.data
      });
    }

    // 格式化输出
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

    // 返回格式
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

    // 默认 JSON
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
    const d = rec.data || {};
    const uv = d.curUv || 0;
    const pv = d.curPv || 0;
    const bounceRate = d.curBounceRate ? (d.curBounceRate * 100).toFixed(2) + '%' : '';
    const avgDur = d.curAvgDuration ? (d.curAvgDuration / 1000).toFixed(2) : '';
    const pvPerUv = uv > 0 ? (pv / uv).toFixed(2) : '';

    lines.push([
      rec.site,
      rec.date,
      uv,
      pv,
      d.curSv || 0,
      d.curIp || 0,
      d.curNewUserCount || 0,
      bounceRate,
      avgDur,
      pvPerUv
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = handler;
module.exports.handler = handler;

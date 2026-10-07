/**
 * GET /api/export?key=密码&format=json&site=xxx&days=7
 * 从 MongoDB 导出原始数据（带访问密码验证）
 *
 * 密码从环境变量 EXPORT_KEY 读取，通过 query 参数 key 传入验证
 *
 * format: json | csv
 */

const { wrapHandler } = require('./_utils/handler');
const { getMongo, buildDateQuery } = require('./_utils/mongo');
const { handleMethodAndCors, errorResponse, fileResponse, getQuery, getQueryInt, getQueryStr } = require('./_utils/response');
const { generateCSV } = require('./_utils/csv');
const config = require('./_utils/config');

const EXPORT_KEY = config.exportKey;

/**
 * 按站点分组记录
 */
function groupBySite(records) {
  const bySite = {};
  for (const r of records) {
    if (!bySite[r.site]) bySite[r.site] = [];
    bySite[r.site].push({ date: r.date, data: r.data });
  }
  return Object.keys(bySite).map(siteName => ({
    site: siteName,
    recordCount: bySite[siteName].length,
    records: bySite[siteName]
  }));
}

/**
 * 构建导出结果
 */
function buildExportResult(records, sites) {
  return {
    exportedAt: new Date().toISOString(),
    source: '51.LA Analytics',
    totalSites: sites.length,
    totalRecords: records.length,
    sites
  };
}

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  const query = getQuery(event);
  const key = getQueryStr(query, 'key');

  // 密码验证（配置了 EXPORT_KEY 才需要验证）
  if (EXPORT_KEY && key !== EXPORT_KEY) {
    return errorResponse('访问密码错误', 403);
  }

  try {
    const format = getQueryStr(query, 'format', 'json').toLowerCase();
    const site = getQueryStr(query, 'site');
    const days = getQueryInt(query, 'days', 0);
    const startDate = getQueryStr(query, 'start');
    const endDate = getQueryStr(query, 'end');

    const { collection } = await getMongo();
    const findQuery = buildDateQuery({ site, days, start: startDate, end: endDate });
    const records = await collection.find(findQuery).sort({ site: 1, date: 1 }).toArray();

    const timestamp = Date.now();

    if (format === 'csv') {
      const csv = generateCSV(records);
      return fileResponse(
        '\uFEFF' + csv,
        `analytics-export-${timestamp}.csv`,
        'text/csv; charset=utf-8'
      );
    }

    // 默认 JSON
    const sites = groupBySite(records);
    const result = buildExportResult(records, sites);
    return fileResponse(
      JSON.stringify(result),
      `analytics-export-${timestamp}.json`,
      'application/json; charset=utf-8'
    );
  } catch (e) {
    console.error('export error:', e);
    return errorResponse('导出失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

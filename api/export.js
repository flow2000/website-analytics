/**
 * GET /api/export?key=密码&site=<域名|all>&days=30&format=json|csv&start=&end=
 *
 * 导出 Cloudflare GraphQL Analytics 原始数据（默认近 30 天）。
 * 密码通过环境变量 EXPORT_KEY 配置，未配置则不启用密码保护。
 *
 * JSON 格式：按站点返回未经处理的 GraphQL 原始返回（httpRequests1dGroups 全量字段 +
 * 设备类型分布），外部程序可基于此生成 report.json 供前端渲染。
 */

const { wrapHandler } = require('./_utils/handler');
const cf = require('./_utils/cloudflare');
const config = require('./_utils/config');
const { handleMethodAndCors, errorResponse, fileResponse, getQuery, getQueryInt, getQueryStr } = require('./_utils/response');
const { generateCSV } = require('./_utils/csv');

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  const query = getQuery(event);
  const key = getQueryStr(query, 'key');

  // 密码验证（配置了 EXPORT_KEY 才需要验证）
  if (config.exportKey && key !== config.exportKey) {
    return errorResponse('访问密码错误', 403);
  }

  try {
    const format = getQueryStr(query, 'format', 'json').toLowerCase();
    if (format !== 'json' && format !== 'csv') {
      return errorResponse(`不支持的导出格式: ${format}（仅支持 json / csv）`, 400);
    }

    const siteParam = getQueryStr(query, 'site');
    const days = getQueryInt(query, 'days', config.exportDefaultDays) || config.exportDefaultDays;
    const startParam = getQueryStr(query, 'start');
    const endParam = getQueryStr(query, 'end');

    // 天数范围限制，防止滥用
    const effectiveDays = Math.min(Math.max(days, 1), config.exportMaxDays);
    const today = cf.utcDateStr(new Date());
    const range = {
      start: isValidDateStr(startParam) ? startParam : cf.addDays(today, -(effectiveDays - 1)),
      end: isValidDateStr(endParam) ? endParam : today,
    };

    // 解析站点
    const zones = await cf.listZones(config);
    const siteKey = (siteParam || 'all').toLowerCase();
    const targetZones = (siteKey === 'all' || siteKey === '')
      ? zones
      : zones.filter(z => z.name.toLowerCase() === siteKey || z.zoneId.toLowerCase() === siteKey);
    if (!targetZones.length) {
      return errorResponse(`站点不存在或无权访问: ${siteParam}`, 404);
    }

    // 查询原始数据（按 10 个 zone 一批）
    const dailyZoneResults = await cf.fetchDailyGroups(targetZones, range.start, range.end);
    const deviceStartIso = new Date(Date.now() - Math.min(effectiveDays, config.deviceSampleDays) * 86400000).toISOString();
    const deviceZoneResults = await cf.fetchDeviceGroups(targetZones, deviceStartIso, new Date().toISOString());

    const dailyByZone = new Map(dailyZoneResults.map(z => [z.zoneTag, z.httpRequests1dGroups || []]));
    const devicesByZone = new Map(deviceZoneResults.map(z => [z.zoneTag, z.httpRequestsAdaptiveGroups || []]));

    const timestamp = Date.now();
    const zoneNameById = new Map(targetZones.map(z => [z.zoneId, z.name]));

    if (format === 'csv') {
      const rows = [];
      for (const [zoneTag, groups] of dailyByZone) {
        rows.push(...cf.flattenDailyRows(zoneNameById.get(zoneTag) || zoneTag, groups));
      }
      rows.sort((a, b) => (a.site === b.site ? String(a.date).localeCompare(String(b.date)) : a.site.localeCompare(b.site)));
      return fileResponse(
        '\uFEFF' + generateCSV(rows),
        `cloudflare-analytics-export-${timestamp}.csv`,
        'text/csv; charset=utf-8'
      );
    }

    // JSON：保留 GraphQL 原始返回结构
    const sites = targetZones.map(z => ({
      site: z.name,
      zoneId: z.zoneId,
      datasets: {
        // GraphQL httpRequests1dGroups 原始返回（未做任何加工）
        httpRequests1dGroups: dailyByZone.get(z.zoneId) || [],
        // 设备类型分布（Adaptive 采样，近 min(days, 3) 天窗口）
        httpRequestsAdaptiveGroups_deviceTypes: devicesByZone.get(z.zoneId) || [],
      },
    }));

    const result = {
      exportedAt: new Date().toISOString(),
      source: 'Cloudflare GraphQL Analytics API',
      queryInfo: {
        dataset: 'httpRequests1dGroups',
        date_geq: range.start,
        date_leq: range.end,
        dateBasis: 'UTC',
        fields: ['requests', 'pageViews', 'bytes', 'threats', 'cachedBytes', 'cachedRequests',
          'encryptedBytes', 'encryptedRequests', 'countryMap', 'responseStatusMap',
          'contentTypeMap', 'browserMap', 'uniq.uniques'],
      },
      totalSites: sites.length,
      totalRecords: sites.reduce((n, s) => n + s.datasets.httpRequests1dGroups.length, 0),
      sites,
    };

    return fileResponse(
      JSON.stringify(result),
      `cloudflare-analytics-export-${timestamp}.json`,
      'application/json; charset=utf-8'
    );
  } catch (e) {
    console.error('export error:', e);
    return errorResponse('导出失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

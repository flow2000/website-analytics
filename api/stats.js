/**
 * GET /api/stats?site=<域名或zoneId|all>&range=today|7d|30d
 *
 * 实时查询 Cloudflare GraphQL Analytics 并返回聚合统计：
 * - KPI 总量（请求/PV/独立访客/流量/缓存命中/威胁）
 * - 趋势（今天=按小时，其余=按日）
 * - 多维分布：国家/状态码/内容类型/浏览器/设备类型
 * - 多站点时附带 perSite 明细（用于对比表）
 *
 * 日期口径与 Cloudflare 一致，使用 UTC（「今天」为 UTC 当天，含未结束的部分数据）。
 */

const { wrapHandler } = require('./_utils/handler');
const cf = require('./_utils/cloudflare');
const config = require('./_utils/config');
const { handleMethodAndCors, successResponse, errorResponse, getQuery, getQueryStr } = require('./_utils/response');

/**
 * 解析站点参数为 zone 列表
 * @returns {Promise<Array>} zones 或抛出异常（带 statusCode）
 */
async function resolveZones(siteParam) {
  const zones = await cf.listZones(config);
  if (!zones.length) {
    const err = new Error('Token 未匹配到任何站点，请检查 CLOUDFLARE_API_TOKEN 权限（Zone → Analytics → Read）');
    err.statusCode = 404;
    throw err;
  }
  const key = (siteParam || 'all').toLowerCase();
  if (key === 'all' || key === '') return zones;
  const matched = zones.find(z => z.name.toLowerCase() === key || z.zoneId.toLowerCase() === key);
  if (!matched) {
    const err = new Error(`站点不存在或无权访问: ${siteParam}`);
    err.statusCode = 404;
    throw err;
  }
  return [matched];
}

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  try {
    const query = getQuery(event);
    const siteParam = getQueryStr(query, 'site');
    const range = cf.getRange(getQueryStr(query, 'range', '7d'));

    const zones = await resolveZones(siteParam);
    const zoneNameById = new Map(zones.map(z => [z.zoneId, z.name]));
    const generatedAt = new Date().toISOString();

    // 1) 按日聚合（核心数据，所有范围都需要）
    const dailyZoneResults = await cf.fetchDailyGroups(zones, range.start, range.end);
    const stats = cf.buildDailyStats(dailyZoneResults, zoneNameById);

    // 2) 今天 → 按小时趋势
    let hourly = [];
    if (range.key === 'today') {
      const nowIso = new Date().toISOString();
      const hourlyZoneResults = await cf.fetchHourlyGroups(zones, `${range.start}T00:00:00Z`, nowIso);
      hourly = cf.buildHourlyTrend(hourlyZoneResults);
    }

    // 3) 设备类型分布（Adaptive 采样窗口受限，取 min(范围, 3天) 作为样本）
    const deviceWindowDays = Math.min(range.days, config.deviceSampleDays);
    const now = Date.now();
    const deviceStartIso = new Date(now - deviceWindowDays * 86400000).toISOString();
    const deviceZoneResults = await cf.fetchDeviceGroups(zones, deviceStartIso, new Date(now).toISOString());
    const devices = cf.buildDeviceStats(deviceZoneResults);

    return successResponse({
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
      breakdowns: {
        ...stats.breakdowns,
        devices,
        devicesWindowDays: deviceWindowDays,
      },
      perSite: stats.perSite,
    }, { cache: `public, max-age=${config.statsCacheSeconds}` });
  } catch (e) {
    console.error('stats api error:', e);
    return errorResponse('获取统计数据失败: ' + e.message, e.statusCode || 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

/**
 * GET /api/stats?site=xxx&days=7
 * 获取统计数据（用于前端展示）
 *
 * 参数：
 *   site  - 站点名，留空或 all 则返回所有站点总览
 *   days  - 最近 N 天数据，默认 7
 */

const { wrapHandler } = require('./_utils/handler');
const { getMongo, fetchSiteData, fetchAllSitesData } = require('./_utils/mongo');
const { buildSiteData, buildOverviewData } = require('./_utils/analyzer');
const { handleMethodAndCors, successResponse, errorResponse, getQuery, getQueryInt, getQueryStr } = require('./_utils/response');
const config = require('./_utils/config');

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  try {
    const query = getQuery(event);
    const site = getQueryStr(query, 'site');
    const days = getQueryInt(query, 'days', config.defaultDays);

    const { collection } = await getMongo();

    if (site && site !== 'all') {
      // 单站点数据
      const siteData = await fetchSiteData(collection, site, days, buildSiteData);
      return successResponse({ days, site: siteData });
    }

    // 多站点总览
    const siteDataList = await fetchAllSitesData(collection, days, buildSiteData);
    const overview = buildOverviewData(siteDataList, days);
    return successResponse({ days, overview, sites: siteDataList });
  } catch (e) {
    console.error('stats api error:', e);
    return errorResponse('获取统计数据失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

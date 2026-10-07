/**
 * GET /api/analysis?site=xxx&days=7
 * 获取 AI 分析报告（基于规则生成的模拟 AI 分析）
 *
 * 该接口生成的分析数据可用于：
 * 1. 前端展示 AI 分析报告
 * 2. 导出给外部程序进行真正的 AI 分析
 *
 * 参数：
 *   site  - 站点名，留空或 all 则返回总览分析
 *   days  - 最近 N 天数据，默认 7
 *   key   - 访问密码（可选，与 EXPORT_KEY 一致时可访问）
 */

const { wrapHandler } = require('./_utils/handler');
const { getMongo, fetchSiteData, fetchAllSitesData } = require('./_utils/mongo');
const { buildSiteData, buildOverviewData, generateSiteAIReport, generateOverviewAI } = require('./_utils/analyzer');
const { handleMethodAndCors, successResponse, errorResponse, getQuery, getQueryInt, getQueryStr } = require('./_utils/response');
const config = require('./_utils/config');

const EXPORT_KEY = config.exportKey;
const REPORT_VERSION = '2.0';
const GENERATOR = '51.LA Analytics Engine';
const DATA_SOURCE = '51.LA Open API V6';

/**
 * 构建报告元数据
 */
function buildReportMeta(days) {
  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    generator: GENERATOR,
    dataSource: DATA_SOURCE,
    days
  };
}

/**
 * 下载响应选项（触发浏览器下载）
 */
function downloadOptions(filename) {
  return {
    extraHeaders: {
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  };
}

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  try {
    const query = getQuery(event);
    const site = getQueryStr(query, 'site');
    const days = getQueryInt(query, 'days', config.defaultDays);
    const key = getQueryStr(query, 'key');

    // 如果配置了 EXPORT_KEY 且请求带了 key，则验证
    if (EXPORT_KEY && key && key !== EXPORT_KEY) {
      return errorResponse('访问密码错误', 403);
    }

    const { collection } = await getMongo();
    const filename = `analysis-report-${Date.now()}.json`;

    if (site && site !== 'all') {
      // 单站点分析
      const siteData = await fetchSiteData(collection, site, days, buildSiteData);
      siteData.aiReport = generateSiteAIReport(siteData);

      return successResponse({
        ...buildReportMeta(days),
        site: siteData
      }, downloadOptions(filename));
    }

    // 多站点总览分析
    const siteDataList = await fetchAllSitesData(collection, days, buildSiteData);
    siteDataList.forEach(s => { s.aiReport = generateSiteAIReport(s); });

    const overview = buildOverviewData(siteDataList, days);
    const overallAI = generateOverviewAI(siteDataList, overview);

    return successResponse({
      ...buildReportMeta(days),
      summary: overview,
      sites: siteDataList,
      overallAI
    }, downloadOptions(filename));
  } catch (e) {
    console.error('analysis api error:', e);
    return errorResponse('获取分析数据失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

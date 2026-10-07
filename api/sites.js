/**
 * GET /api/sites
 * 获取所有站点列表
 */

const { wrapHandler } = require('./_utils/handler');
const { getMongo, getAllSites } = require('./_utils/mongo');
const { handleMethodAndCors, successResponse, errorResponse } = require('./_utils/response');

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  try {
    const { collection } = await getMongo();
    const sites = await getAllSites(collection);

    return successResponse({
      total: sites.length,
      sites: sites.map(name => ({ name }))
    });
  } catch (e) {
    console.error('sites api error:', e);
    return errorResponse('获取站点列表失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

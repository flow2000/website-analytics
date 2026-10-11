/**
 * GET /api/usage
 * 获取 Vercel / Netlify 部署平台额度使用情况
 * 需在部署平台配置 VERCEL_TOKEN / NETLIFY_TOKEN 环境变量，未配置的平台返回 configured: false
 */

const { wrapHandler } = require('./_utils/handler');
const { handleMethodAndCors, successResponse } = require('./_utils/response');
const { getVercelUsage, getNetlifyUsage } = require('./_utils/usage');

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  const [vercel, netlify] = await Promise.all([
    getVercelUsage(),
    getNetlifyUsage()
  ]);

  return successResponse({
    fetchedAt: new Date().toISOString(),
    vercel,
    netlify
  }, { cache: 'no-store' });
});

module.exports = handler;
module.exports.handler = handler;

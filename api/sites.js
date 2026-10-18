/**
 * GET /api/sites
 * 获取 Cloudflare 站点（zone）列表
 *
 * 数据来源：
 * - 配置 CF_ZONES 白名单 → GraphQL zoneName 解析（Token 仅需 Zone Analytics Read）
 * - 未配置 → REST /zones 自动发现（Token 需 Zone Read 权限）
 */

const { wrapHandler } = require('./_utils/handler');
const cf = require('./_utils/cloudflare');
const config = require('./_utils/config');
const { handleMethodAndCors, successResponse, errorResponse } = require('./_utils/response');

const handler = wrapHandler(async (event) => {
  const early = handleMethodAndCors(event);
  if (early) return early;

  try {
    const zones = await cf.listZones(config);
    return successResponse({
      total: zones.length,
      sites: zones.map(z => ({
        name: z.name,
        zoneId: z.zoneId,
        status: z.status,
        plan: z.plan,
      })),
    });
  } catch (e) {
    console.error('sites api error:', e);
    return errorResponse('获取站点列表失败: ' + e.message, 500);
  }
});

module.exports = handler;
module.exports.handler = handler;

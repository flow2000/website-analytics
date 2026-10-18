/**
 * 共享配置
 * 统一环境变量读取和默认值
 */

/**
 * 解析 CF_ZONES 环境变量（站点白名单）
 * 支持逗号分隔或 JSON 数组格式："a.com,b.com" 或 '["a.com","b.com"]'
 */
function parseZoneWhitelist(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
  } catch (_) { /* 非 JSON，按逗号分隔处理 */ }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  // Cloudflare API Token
  // 需要权限：Zone → Analytics → Read；如需自动列出站点另需 Zone → Zone → Read
  apiToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '',

  // 可选：限定账号 ID（列出站点时过滤）
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',

  // 可选：站点白名单（只暴露这些 zone），未配置则暴露 Token 可访问的全部 zone
  zoneWhitelist: parseZoneWhitelist(process.env.CF_ZONES || ''),

  // 导出接口访问密码（防滥用）
  exportKey: process.env.EXPORT_KEY || '',

  // 导出天数限制
  exportDefaultDays: 30,
  exportMaxDays: 92,

  // 统计响应 CDN 缓存（秒），降低 GraphQL 调用频率
  statsCacheSeconds: 300,

  // 设备类型采样窗口（天），Adaptive 数据集单次查询时间跨度有限制
  deviceSampleDays: 3,
};

module.exports = config;

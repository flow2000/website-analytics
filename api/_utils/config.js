/**
 * 共享配置
 * 统一环境变量读取和默认值
 */

const config = {
  // MongoDB 配置
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDb: process.env.MONGODB_DB || 'website_statistics',
  mongodbCol: process.env.MONGODB_COL || '51.la',

  // 导出接口访问密码
  exportKey: process.env.EXPORT_KEY || '',

  // 部署平台额度查询（/api/usage）
  vercelToken: process.env.VERCEL_TOKEN || '',
  vercelTeamId: process.env.VERCEL_TEAM_ID || '',
  netlifyToken: process.env.NETLIFY_TOKEN || '',
  netlifyAccountSlug: process.env.NETLIFY_ACCOUNT_SLUG || '',

  // 默认统计天数
  defaultDays: 7,

  // 51.la API 配置（用于采集脚本）
  la51ApiId: process.env.LA51_API_ID || '',
  la51ApiKey: process.env.LA51_API_KEY || '',
};

module.exports = config;

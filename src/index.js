/**
 * Cloudflare Worker 入口
 * 路由 + 静态页面 + 数据接口访问控制 + Cron（每日快照）
 */

import { corsReply, htmlReply, errorReply } from './_utils/response.js';
import { isDataAccessAllowed } from './_utils/auth.js';
import { handleSites } from './api/sites.js';
import { handleStats } from './api/stats.js';
import { handleExport } from './api/export.js';
import { handleConfig } from './api/config.js';
import { handleAuth } from './api/auth.js';
import { handleReport } from './api/report.js';
import { handleUsage } from './api/usage.js';
import { runScheduled } from './cron.js';
import DASHBOARD from './dashboard.js';

/** 受全局访问控制保护的数据接口（GET） */
const DATA_API_PATHS = ['/api/stats', '/api/sites', '/api/export', '/api/report'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return corsReply();

    // 数据接口访问控制（全局：无 / 访问密码 / APP 二次验证）
    if (request.method === 'GET' && DATA_API_PATHS.includes(path)) {
      if (!(await isDataAccessAllowed(env, request))) {
        return errorReply('需要认证：请使用访问密码或 APP 验证码登录', 401);
      }
    }

    if (path === '/' || path === '/index.html') return htmlReply(DASHBOARD);

    if (path === '/api/stats') return handleStats(request, env);
    if (path === '/api/sites') return handleSites(request, env);
    if (path === '/api/export') return handleExport(request, env);
    if (path === '/api/config') return handleConfig(request, env);
    if (path === '/api/auth') return handleAuth(request, env);
    if (path === '/api/report') return handleReport(request, env);
    if (path === '/api/usage') return handleUsage(env);

    return errorReply('Not Found: ' + path, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
};
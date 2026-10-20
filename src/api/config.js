/**
 * /api/config 全局访问控制配置
 * GET  /api/config → 公开探针：当前访问模式
 * POST /api/config → 管理操作（EXPORT_KEY 鉴权）
 *   { action:'status' }              当前完整配置
 *   { action:'mode',   mode }        切换 none|password|totp
 *   { action:'password', password }  设置登录密码（并切换到 password 模式）
 *   { action:'totp-new' }            生成待绑定 TOTP 密钥 -> { secret, otpauthURL }
 *   { action:'totp-verify', code }   验证待绑定 TOTP 并启用
 *   { action:'totp-reset' }          重置 TOTP（回到 none）
 *   { action:'disable' }             关闭所有访问控制
 */

import { errorReply, jsonReply, getAdminKey, methodIs, readJsonBody } from '../_utils/response.js';
import { getSetting, setSetting } from '../_utils/d1.js';
import {
  getAccessMode, ACCESS_NONE, ACCESS_PASSWORD, ACCESS_TOTP,
  hashPassword, generateTotpSecret, otpauthUrl, verifyTotp,
} from '../_utils/auth.js';

export async function handleConfig(request, env) {
  if (methodIs(request, 'GET')) {
    const mode = await getAccessMode(env);
    return jsonReply({ mode, needsAuth: mode !== ACCESS_NONE, appName: env.APP_NAME || 'Cloudflare Analytics' }, { cache: 'no-cache' });
  }

  if (!methodIs(request, 'POST')) return errorReply('Method not allowed', 405);
  if (!getAdminKey(request, env)) return errorReply('管理密钥错误（EXPORT_KEY）', 403);

  let body = await readJsonBody(request);
  if (!body) return errorReply('请求体需为 JSON', 400);
  const action = body.action || 'mode';

  try {
    switch (action) {
      case 'status': {
        const mode = await getAccessMode(env);
        return jsonReply({
          mode,
          passwordConfigured: !!(await getSetting(env, 'access_password_hash')),
          totpConfigured: !!(await getSetting(env, 'totp_secret')),
          totpPending: !!(await getSetting(env, 'totp_pending_secret')),
        });
      }

      case 'mode': {
        const mode = body.mode;
        if (![ACCESS_NONE, ACCESS_PASSWORD, ACCESS_TOTP].includes(mode)) return errorReply('无效的 mode', 400);
        await setSetting(env, 'access_mode', mode);
        return jsonReply({ mode });
      }

      case 'password': {
        const password = String(body.password || '');
        if (password.length < 4) return errorReply('密码至少 4 位', 400);
        const { salt, hash } = await hashPassword(password);
        await setSetting(env, 'access_password_salt', salt);
        await setSetting(env, 'access_password_hash', hash);
        await setSetting(env, 'access_mode', ACCESS_PASSWORD);
        return jsonReply({ mode: ACCESS_PASSWORD, message: '访问密码已设置并启用' });
      }

      case 'totp-new': {
        const secret = generateTotpSecret();
        await setSetting(env, 'totp_pending_secret', secret);
        return jsonReply({ secret, otpauthURL: otpauthUrl(secret) });
      }

      case 'totp-verify': {
        const pending = await getSetting(env, 'totp_pending_secret');
        if (!pending) return errorReply('请先执行 totp-new 获取密钥', 400);
        if (!(await verifyTotp(pending, body.code))) return errorReply('验证码错误或已过期', 400);
        await setSetting(env, 'totp_secret', pending);
        await setSetting(env, 'totp_pending_secret', '');
        await setSetting(env, 'access_mode', ACCESS_TOTP);
        return jsonReply({ mode: ACCESS_TOTP, message: 'APP 二次验证已启用' });
      }

      case 'totp-reset':
        await setSetting(env, 'totp_secret', '');
        await setSetting(env, 'totp_pending_secret', '');
        await setSetting(env, 'access_mode', ACCESS_NONE);
        return jsonReply({ mode: ACCESS_NONE, message: '已重置 APP 二次验证' });

      case 'disable':
        await setSetting(env, 'access_mode', ACCESS_NONE);
        await setSetting(env, 'access_password_hash', '');
        await setSetting(env, 'access_password_salt', '');
        await setSetting(env, 'totp_secret', '');
        await setSetting(env, 'totp_pending_secret', '');
        return jsonReply({ mode: ACCESS_NONE, message: '访问控制已全部关闭（公开访问）' });

      default:
        return errorReply('未知 action: ' + action, 400);
    }
  } catch (e) {
    console.error('config error:', e);
    return errorReply('配置操作失败: ' + e.message, 500);
  }
}
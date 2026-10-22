/**
 * POST /api/auth → 访问认证：密码 或 TOTP 验证码，成功签发 wa_auth Cookie
 * body: { password } 或 { code }
 */

import { errorReply, methodIs, readJsonBody } from '../_utils/response.js';
import { getSetting } from '../_utils/d1.js';
import {
  getAccessMode, ACCESS_PASSWORD, ACCESS_TOTP,
  verifyPassword, verifyTotp, makeAuthCookie,
} from '../_utils/auth.js';

export async function handleAuth(request, env) {
  if (!methodIs(request, 'POST')) return errorReply('Method not allowed', 405);

  let body = await readJsonBody(request);
  if (!body) return errorReply('请求体需为 JSON', 400);

  try {
    const mode = await getAccessMode(env);
    if (mode === 'none') return errorReply('当前无需认证', 400);

    if (mode === ACCESS_PASSWORD) {
      const salt = await getSetting(env, 'access_password_salt');
      const hash = await getSetting(env, 'access_password_hash');
      if (!(await verifyPassword(body.password, salt, hash))) {
        return errorReply('访问密码错误', 401);
      }
    } else if (mode === ACCESS_TOTP) {
      const secret = await getSetting(env, 'totp_secret');
      if (!(await verifyTotp(secret, body.code))) {
        return errorReply('验证码错误或已过期', 401);
      }
    } else {
      return errorReply('当前无需认证', 400);
    }

    const cookie = await makeAuthCookie(env, mode === ACCESS_TOTP ? 2 : undefined);
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('auth error:', e);
    return errorReply('认证失败: ' + e.message, 500);
  }
}
/**
 * 统一响应工具（Workers 版）
 * 沿用 main 分支响应约定：{ success, data } / { success:false, message }
 */

export function jsonReply(data, options = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': options.origin || '*',
    'Cache-Control': options.cache || 'public, max-age=300',
  };
  if (options.extraHeaders) Object.assign(headers, options.extraHeaders);
  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
}

export function errorReply(message, status = 400) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export function fileReply(body, filename, contentType, cache = 'no-cache') {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cache,
    },
  });
}

export function corsReply() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Requested-With',
    },
  });
}

export function htmlReply(body, cache = 'no-cache') {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache },
  });
}

/** 解析 URL 查询参数 */
export function getQuery(request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export function getQueryStr(query, key, fallback = '') {
  const v = query[key];
  return v === undefined || v === null ? fallback : String(v);
}

export function getQueryInt(query, key, fallback = 0) {
  const v = parseInt(query[key], 10);
  return isNaN(v) ? fallback : v;
}

/** 从请求中提取管理密钥（query key 或 X-Admin-Key 头），并校验 */
export function getAdminKey(request, env) {
  const query = getQuery(request);
  const key = query.key || request.headers.get('X-Admin-Key') || '';
  if (!env.EXPORT_KEY) return null; // 未配置管理密钥 → 禁用管理操作
  return key === env.EXPORT_KEY;
}

export function methodIs(request, method) {
  return request.method.toUpperCase() === method;
}

/** 稳健读取 JSON 请求体（兼容各种运行时） */
export async function readJsonBody(request) {
  let text = '';
  try {
    text = await request.text();
  } catch (_) { /* 空 */ }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return null; // 非 JSON
  }
}
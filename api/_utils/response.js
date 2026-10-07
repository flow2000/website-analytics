/**
 * 共享响应工具
 * 统一 API 响应格式、CORS 处理、错误响应、Query 解析
 */

function successResponse(data, options = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': options.cache || 'public, max-age=300'
  };
  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders);
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, data })
  };
}

function errorResponse(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ success: false, message })
  };
}

function corsResponse(body = '') {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body
  };
}

/**
 * 文件下载响应
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} contentType - MIME 类型
 * @param {object} [options] - 额外选项
 */
function fileResponse(content, filename, contentType, options = {}) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': options.cache || 'no-cache',
      ...(options.extraHeaders || {})
    },
    body: content
  };
}

/**
 * 统一处理方法校验 + CORS 预检
 * @param {object} event - 请求事件
 * @param {string} [allowedMethod='GET'] - 允许的方法
 * @returns {object|null} 若需提前返回则返回响应，否则返回 null
 */
function handleMethodAndCors(event, allowedMethod = 'GET') {
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return corsResponse();
  }

  if (method !== allowedMethod) {
    return errorResponse('Method not allowed', 405);
  }

  return null;
}

/**
 * 解析 query 参数（兼容 Netlify 和 Vercel）
 * @param {object} event - 请求事件
 * @returns {object} query 参数对象
 */
function getQuery(event) {
  return event.query || event.queryStringParameters || {};
}

/**
 * 从 query 中获取数字参数
 * @param {object} query - query 对象
 * @param {string} key - 参数名
 * @param {number} defaultValue - 默认值
 * @returns {number}
 */
function getQueryInt(query, key, defaultValue = 0) {
  const val = parseInt(query[key], 10);
  return isNaN(val) ? defaultValue : val;
}

/**
 * 从 query 中获取字符串参数
 * @param {object} query - query 对象
 * @param {string} key - 参数名
 * @param {string} defaultValue - 默认值
 * @returns {string}
 */
function getQueryStr(query, key, defaultValue = '') {
  return query[key] || defaultValue;
}

module.exports = {
  successResponse,
  errorResponse,
  corsResponse,
  fileResponse,
  handleMethodAndCors,
  getQuery,
  getQueryInt,
  getQueryStr
};

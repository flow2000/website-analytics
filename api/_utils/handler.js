/**
 * 平台兼容层 - 统一 Netlify 和 Vercel 的函数调用方式
 *
 * Netlify: exports.handler = async (event, context) => { return { statusCode, body } }
 * Vercel:  module.exports = (req, res) => { res.status(200).json(...) }
 *
 * 用法：
 * const { wrapHandler } = require('./_utils/handler');
 * module.exports = wrapHandler(async (event) => { ... });
 */

/**
 * 将统一格式的 handler 包装为当前平台可用的格式
 * @param {Function} handler - (event, context) => { statusCode, headers, body }
 */
function wrapHandler(handler) {
  // 检测是否为 Vercel 环境（通过检查 module.exports 的使用方式）
  // 我们返回一个双兼容的函数

  return function vercelOrNetlify(reqOrEvent, resOrContext) {
    // Vercel 风格: (req, res)
    if (reqOrEvent.method && resOrContext && typeof resOrContext.status === 'function') {
      return handleVercel(handler, reqOrEvent, resOrContext);
    }
    // Netlify 风格: (event, context)
    if (reqOrEvent.httpMethod || reqOrEvent.path) {
      return handler(reqOrEvent, resOrContext);
    }
    // 兜底：当 Netlify 函数
    return handler(reqOrEvent, resOrContext);
  };
}

/**
 * Vercel Express 风格适配
 */
async function handleVercel(handler, req, res) {
  // 将 Express req 转换为类 Netlify event
  const event = {
    httpMethod: req.method,
    method: req.method,
    path: req.url?.split('?')[0] || req.path,
    query: req.query || {},
    queryStringParameters: req.query || {},
    headers: req.headers || {},
    body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null
  };

  // 读取 body （如果是流）
  if (!req.body && req.on) {
    await new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        event.body = body || null;
        resolve();
      });
    });
  }

  try {
    const result = await handler(event, {});
    res.status(result.statusCode || 200);
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(result.body || '');
  } catch (e) {
    console.error('Handler error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { wrapHandler };

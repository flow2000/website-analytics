/**
 * 平台额度使用情况
 * Vercel:  GET /v2/user + /v2/usage（需 VERCEL_TOKEN，可选 VERCEL_TEAM_ID）
 * Netlify: GET /api/v1/accounts（需 NETLIFY_TOKEN，可选 NETLIFY_ACCOUNT_SLUG）
 *
 * 返回统一结构，未配置 Token 的平台返回 configured: false，前端据此渲染提示。
 */

const config = require('./config');

const FETCH_TIMEOUT = 8000;

// Vercel 用量指标：key -> 展示名（未列出的指标使用原 key）
const VERCEL_METRIC_LABELS = {
  bandwidth: '带宽',
  fastDataTransfer: '快速数据传输',
  fastOriginDataTransfer: '源站数据传输',
  buildMinutes: '构建时长',
  builds: '构建次数',
  serverlessFunctionExecution: 'Serverless 执行',
  functionInvocations: '函数调用数',
  edgeFunctionExecutionUnits: 'Edge 函数执行',
  edgeFunctionInvocations: 'Edge 函数调用数',
  edgeMiddlewareInvocations: 'Edge Middleware 调用',
  edgeRequests: 'Edge 请求数',
  imageOptimization: '图片优化',
  imageOptimizer: '图片优化',
  roasts: 'Robots.txt 请求'
};

// Netlify 额度项：key -> 展示名
const NETLIFY_CAPABILITY_LABELS = {
  sites: '站点数',
  collaborators: '协作者数',
  bandwidth: '带宽',
  build_minutes: '构建时长',
  functions_invocations: '函数调用数',
  members: '成员数'
};

/**
 * 带超时的 fetch JSON
 * 优先使用原生 fetch（Node 18+），旧版本回退到 https 模块
 */
async function fetchJSON(url, options = {}) {
  const res = await (typeof fetch === 'function'
    ? fetchWithTimeout(url, options)
    : httpsGet(url, options));
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  if (!res.ok) {
    const msg = (body && (body.error?.message || body.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function httpsGet(url, options = {}) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy(new Error('请求超时'));
    }, FETCH_TIMEOUT);

    const req = https.request(url, { method: 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => data });
      });
    });
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

/**
 * 从指标对象中按候选字段顺序取第一个有限数字
 */
function pickNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (typeof obj[k] === 'number' && isFinite(obj[k])) return obj[k];
  }
  return null;
}

/**
 * 字节数转 GB 展示
 */
function bytesToGB(n) {
  return Math.round((n / (1024 * 1024 * 1024)) * 100) / 100;
}

/**
 * 格式化用量展示文本
 * kind: 'bytes' | 'count' | 'minutes' | 'seconds'
 */
function formatUsage(value, kind) {
  if (value === null || value === undefined) return null;
  if (kind === 'bytes') return `${bytesToGB(value)} GB`;
  if (kind === 'minutes') return `${Math.round(value)} 分钟`;
  if (kind === 'seconds') return `${Math.round(value / 3600)} 小时`;
  return Number(value).toLocaleString('zh-CN');
}

/**
 * 构建统一指标对象
 */
function buildMetric(key, label, used, included, kind) {
  if (used === null && included === null) return null;
  const percent = (used !== null && included) ? Math.round((used / included) * 1000) / 10 : null;
  return {
    key,
    label,
    used,
    usedDisplay: formatUsage(used, kind),
    included,
    includedDisplay: formatUsage(included, kind),
    percent,
    kind
  };
}

/**
 * 格式化账期展示（接受 { start, end }，值为毫秒时间戳或 ISO 字符串）
 */
function formatPeriod(period) {
  if (!period || typeof period !== 'object') return null;
  const fmtOne = (v) => {
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(v < 1e12 ? v * 1000 : v);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    if (typeof v === 'string' && v) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    return null;
  };
  const start = fmtOne(period.start ?? period.from ?? period.begin);
  const end = fmtOne(period.end ?? period.to);
  if (!start && !end) return null;
  return `${start || '?'} ~ ${end || '?'}`;
}

// ===================== Vercel =====================

/**
 * 查询 Vercel 额度使用情况
 */
async function getVercelUsage() {
  const token = config.vercelToken;
  if (!token) {
    return { configured: false, hint: '设置 VERCEL_TOKEN 环境变量以启用 Vercel 额度展示' };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const teamId = config.vercelTeamId;
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

  try {
    // 账号信息：团队用 /v2/teams/{id}，个人用 /v2/user
    let account = null;
    let plan = null;
    if (teamId) {
      try {
        const team = await fetchJSON(`https://api.vercel.com/v2/teams/${encodeURIComponent(teamId)}`, { headers });
        account = team?.name || team?.slug || teamId;
        plan = team?.billing?.plan || null;
      } catch (_) {
        account = teamId;
      }
    } else {
      try {
        const me = await fetchJSON('https://api.vercel.com/v2/user', { headers });
        const u = me?.user || me || {};
        account = u.username || u.name || u.email || 'Vercel 账号';
      } catch (_) {
        account = 'Vercel 账号';
      }
    }

    // 用量：优先无参数调用（返回完整账期），失败则按当前自然月重试
    let usage;
    try {
      usage = await fetchJSON(`https://api.vercel.com/v2/usage${teamQuery}`, { headers });
    } catch (e) {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      usage = await fetchJSON(`https://api.vercel.com/v2/usage${teamQuery ? teamQuery + '&' : '?'}from=${from}&to=${now.getTime()}`, { headers });
    }

    const metrics = normalizeVercelUsage(usage);
    const period = formatPeriod(usage?.period);

    return {
      configured: true,
      ok: true,
      account,
      plan,
      period,
      metrics
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: `Vercel 额度查询失败: ${e.message}`,
      account: null,
      plan: null,
      period: null,
      metrics: []
    };
  }
}

/**
 * 归一化 Vercel /v2/usage 响应
 * 兼容 v2（顶层指标对象）与旧版（days 日汇总）两种形态
 */
function normalizeVercelUsage(usage) {
  if (!usage || typeof usage !== 'object') return [];

  const result = [];
  const seen = new Set();

  // 1) 顶层指标对象（v2 形态）：如 bandwidth: { base, threshold, ... }
  for (const [key, raw] of Object.entries(usage)) {
    if (['ts', 'period', 'days', 'day', 'dayV2', 'budget'].includes(key)) continue;
    if (!raw || typeof raw !== 'object') continue;

    const kind = /bandwidth|DataTransfer/i.test(key) ? 'bytes'
      : /minutes/i.test(key) ? 'minutes'
      : /Execution(?!Units)/i.test(key) ? 'seconds'
      : 'count';

    const used = pickNumber(raw, ['current', 'base', 'used', 'total', 'value']);
    const included = pickNumber(raw, ['threshold', 'included', 'limit', 'volume', 'max']);
    const metric = buildMetric(key, VERCEL_METRIC_LABELS[key] || key, used, included, kind);
    if (metric) {
      result.push(metric);
      seen.add(key);
    }
  }

  // 2) 日汇总形态（days/dayV2/day: { date: { metric: number|object } }）
  for (const dayKey of ['days', 'dayV2', 'day']) {
    const days = usage[dayKey];
    if (!days || typeof days !== 'object') continue;
    for (const [key, raw] of Object.entries(days)) {
      if (seen.has(key) || /^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const kind = /bandwidth|DataTransfer/i.test(key) ? 'bytes'
        : /minutes/i.test(key) ? 'minutes'
        : 'count';
      const used = sumDailyValue(raw);
      if (used === null) continue;
      const metric = buildMetric(key, VERCEL_METRIC_LABELS[key] || key, used, null, kind);
      if (metric) {
        result.push(metric);
        seen.add(key);
      }
    }
  }

  return result;
}

function sumDailyValue(raw) {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (raw && typeof raw === 'object') return pickNumber(raw, ['current', 'base', 'used', 'total', 'value']);
  return null;
}

// ===================== Netlify =====================

/**
 * 查询 Netlify 额度使用情况
 */
async function getNetlifyUsage() {
  const token = config.netlifyToken;
  if (!token) {
    return { configured: false, hint: '设置 NETLIFY_TOKEN 环境变量以启用 Netlify 额度展示' };
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    // GET /api/v1/accounts 返回当前 Token 可见的所有团队（含额度 capabilities）
    const accounts = await fetchJSON('https://api.netlify.com/api/v1/accounts', { headers });
    const list = Array.isArray(accounts) ? accounts : [];
    if (!list.length) {
      throw new Error('未找到可访问的 Netlify 团队');
    }

    const slug = config.netlifyAccountSlug;
    const account = (slug && list.find(a => a.slug === slug || a.id === slug)) || list[0];

    const caps = account?.capabilities || {};
    const metrics = [];
    for (const [key, raw] of Object.entries(caps)) {
      if (!raw || typeof raw !== 'object') continue;
      const used = pickNumber(raw, ['used', 'current', 'total']);
      const included = pickNumber(raw, ['included', 'limit', 'max']);
      if (used === null && included === null) continue;
      const metric = buildMetric(key, NETLIFY_CAPABILITY_LABELS[key] || key, used, included, 'count');
      if (metric) metrics.push(metric);
    }

    return {
      configured: true,
      ok: true,
      account: account?.name || account?.slug || 'Netlify 团队',
      plan: account?.type_name || account?.type || null,
      period: formatPeriod(account?.billing_period || null),
      metrics
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: `Netlify 额度查询失败: ${e.message}`,
      account: null,
      plan: null,
      period: null,
      metrics: []
    };
  }
}

module.exports = { getVercelUsage, getNetlifyUsage };

/**
 * 平台额度使用情况（基于 2026-10 实测 API 结构）
 * Vercel:  GET /v2/user、/v2/teams/{id}、/v2/usage?type=requests|builds&from=&to=（需 VERCEL_TOKEN）
 * Netlify: GET /api/v1/accounts（需 NETLIFY_TOKEN）
 *
 * 返回统一结构，未配置 Token 的平台返回 configured: false，前端据此渲染提示。
 */

const config = require('./config');

const FETCH_TIMEOUT = 8000;

// Vercel 已知套餐的额度上限（API 不返回上限，取自官方仪表盘 Hobby/Pro 套餐页，仅用于计算使用百分比）
const VERCEL_PLAN_LIMITS = {
  hobby: {
    bandwidth: 100 * 1024 * 1024 * 1024, // Fast Data Transfer 100 GB
    requests: 1000000,                   // CDN Requests 1M
    functionInvocations: 1000000,        // Function Invocations 1M
    functionExecution: 100               // Function Duration 100 GB-Hrs
  },
  pro: {
    bandwidth: 1024 * 1024 * 1024 * 1024 // Fast Data Transfer 1 TB
  }
};

// Vercel 用量指标（type=requests / builds 响应字段汇总）
// [输出 key, 展示名, 源字段列表(累加), 单位类型, 数值缩放(默认 1；秒→分钟为 1/60)]
const VERCEL_METRICS = [
  ['bandwidth', '数据传输（外发）', ['bandwidth_outgoing_bytes'], 'bytes', 1],
  ['bandwidthIncoming', '数据传输（入站）', ['bandwidth_incoming_bytes'], 'bytes', 1],
  ['requests', 'CDN 请求数', ['request_hit_count', 'request_miss_count'], 'count', 1],
  ['functionInvocations', '函数调用数', ['function_invocation_successful_count', 'function_invocation_error_count', 'function_invocation_throttle_count', 'function_invocation_timeout_count'], 'count', 1],
  ['functionExecution', '函数执行时长', ['function_execution_successful_gb_hours', 'function_execution_error_gb_hours', 'function_execution_timeout_gb_hours'], 'gbhours', 1],
  ['monitoring', '监控数据点', ['monitoring_metric_count'], 'count', 1],
  ['builds', '构建次数', ['build_completed_count'], 'count', 1],
  ['buildTime', '构建时长', ['build_build_seconds'], 'minutes', 1 / 60],
  ['queuedTime', '构建排队时长', ['build_queued_seconds'], 'minutes', 1 / 60]
];

// Netlify 额度项白名单（GET /api/v1/accounts 的 capabilities 字段，仅保留消耗型额度）
// [capability key, 展示名, 单位类型]
const NETLIFY_CAPABILITIES = [
  ['sites', '站点数', 'count'],
  ['domains', '域名数', 'count'],
  ['bandwidth', '带宽', 'bytes'],
  ['build_minutes', '构建时长', 'minutes'],
  ['edge_functions', 'Edge 函数调用', 'count'],
  ['functions', '函数调用数', 'count'],
  ['functions_gb_hour', '函数执行', 'gbhours'],
  ['builds_gb_hour', '构建执行', 'gbhours'],
  ['form_submissions', '表单提交', 'count'],
  ['form_storage', '表单存储', 'bytes'],
  ['identity_active_logins', 'Identity 活跃登录', 'count']
];

/**
 * 带超时的请求 JSON
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
    const req = https.request(url, { method: 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => data });
      });
    });
    const timer = setTimeout(() => {
      req.destroy(new Error('请求超时'));
    }, FETCH_TIMEOUT);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

/**
 * 从对象中按候选字段顺序取第一个有限数字
 */
function pickNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (typeof obj[k] === 'number' && isFinite(obj[k])) return obj[k];
  }
  return null;
}

/**
 * 汇总 data 数组中指定字段的数值（Vercel /v2/usage 的 data 为分周期条目）
 */
function sumFields(dataList, fields) {
  let total = null;
  for (const d of dataList || []) {
    if (!d || typeof d !== 'object') continue;
    for (const f of fields) {
      const v = d[f];
      if (typeof v === 'number' && isFinite(v)) {
        total = (total || 0) + v;
      }
    }
  }
  return total;
}

/**
 * 字节数转 GB 展示
 */
function bytesToGB(n) {
  return Math.round((n / (1024 * 1024 * 1024)) * 100) / 100;
}

/**
 * 格式化用量展示文本
 * kind: 'bytes' | 'count' | 'minutes' | 'gbhours'
 */
function formatUsage(value, kind) {
  if (value === null || value === undefined) return null;
  if (kind === 'bytes') return `${bytesToGB(value)} GB`;
  if (kind === 'minutes') return `${Math.round(value)} 分钟`;
  if (kind === 'gbhours') return `${Math.round(value * 100) / 100} GB-hrs`;
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
 * 格式化账期展示（值为毫秒时间戳或日期字符串）
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
  const start = fmtOne(period.start ?? period.from);
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

  try {
    // 1) 用户信息（username + 默认团队 ID）
    let account = 'Vercel 账号';
    let teamId = config.vercelTeamId;
    try {
      const me = await fetchJSON('https://api.vercel.com/v2/user', { headers });
      const u = me?.user || me || {};
      if (u.username) account = u.username;
      if (!teamId && u.defaultTeamId) teamId = u.defaultTeamId;
    } catch (_) { /* 用户信息失败不阻断用量查询 */ }

    // 2) 团队信息（团队名 + 套餐）
    let plan = null;
    if (teamId) {
      try {
        const team = await fetchJSON(`https://api.vercel.com/v2/teams/${encodeURIComponent(teamId)}`, { headers });
        if (team?.name) account = team.name;
        if (team?.billing?.plan) plan = team.billing.plan;
      } catch (_) { /* 团队信息失败不阻断用量查询 */ }
    }

    // 3) 用量查询（当前自然月），type=requests 与 type=builds 并行
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const scope = teamId ? `&teamId=${encodeURIComponent(teamId)}` : '';
    const base = `https://api.vercel.com/v2/usage?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}${scope}`;

    const [requests, builds] = await Promise.all([
      fetchJSON(`${base}&type=requests`, { headers }).catch(() => null),
      fetchJSON(`${base}&type=builds`, { headers }).catch(() => null)
    ]);
    const requestData = Array.isArray(requests?.data) ? requests.data : [];
    const buildData = Array.isArray(builds?.data) ? builds.data : [];

    // 4) 汇总指标
    const limits = VERCEL_PLAN_LIMITS[plan] || {};
    const metrics = [];
    for (const [key, label, fields, kind, scale] of VERCEL_METRICS) {
      const sum = sumFields([...requestData, ...buildData], fields);
      if (sum === null) continue;
      const used = scale === 1 ? sum : sum * scale;
      const metric = buildMetric(key, label, used, limits[key] ?? null, kind);
      if (metric) metrics.push(metric);
    }

    return {
      configured: true,
      ok: true,
      account,
      plan,
      period: `${from.toISOString().slice(0, 10)} ~ ${now.toISOString().slice(0, 10)}`,
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
    for (const [key, label, kind] of NETLIFY_CAPABILITIES) {
      const raw = caps[key];
      if (!raw || typeof raw !== 'object') continue;
      const used = pickNumber(raw, ['used']);
      const included = pickNumber(raw, ['included', 'max']);
      if (used === null && included === null) continue;
      const metric = buildMetric(key, label, used, included, kind);
      if (metric) metrics.push(metric);
    }

    return {
      configured: true,
      ok: true,
      account: account?.name || account?.slug || 'Netlify 团队',
      plan: account?.type_name || account?.type || null,
      period: formatPeriod({
        start: account?.current_billing_period_start,
        end: account?.next_billing_period_start
      }),
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

/**
 * Cloudflare 平台额度查询（Workers / D1）
 * - Workers：workersInvocationsAdaptive（账户级 GraphQL）查询当日请求数
 * - D1：d1AnalyticsAdaptiveGroups（账户级 GraphQL）查询当日读/写查询次数
 *   注：D1 免费档行数上限（读500万/写10万/日）无法直接度量，仅展示查询次数参考
 * - Workers 免费档请求上限 hardcode（同 V1.0.0 方案）
 * - 任一路径失败 → configured:false，前端隐藏对应卡片
 */

import { graphqlRequest, getAccountId } from './cloudflare.js';

export const PLAN_LIMITS = {
  // Workers Free：10 万请求/日（以 Cloudflare Pricing 文档为准）
  workersRequestsPerDay: 100000,
  // D1 Free：500 万行读/日、10 万行写/日（行数上限，仅作说明）
  d1ReadRowsPerDay: 5000000,
  d1WriteRowsPerDay: 100000,
};

/** 今日 UTC 起止（ISO） */
function todayWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    datetimeGeq: start.toISOString(),
    datetimeLt: new Date(start.getTime() + 86400000).toISOString(),
  };
}

const Q_WORKERS = `
query WorkersUsage($accountTag: String!, $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 20
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests }
      }
    }
  }
}`;

const Q_D1 = `
query D1Usage($accountTag: String!, $datetimeGeq: Time, $datetimeLt: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 20
        filter: { datetime_geq: $datetimeGeq, datetime_lt: $datetimeLt }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { readQueries writeQueries }
      }
    }
  }
}`;

async function queryAccount(env, query) {
  const accountId = getAccountId(env);
  if (!accountId) throw new Error('未配置 CLOUDFLARE_ACCOUNT_ID');
  const window = todayWindow();
  const data = await graphqlRequest(env, query, { accountTag: accountId, ...window });
  const accounts = data.viewer && data.viewer.accounts;
  return (accounts && accounts[0]) || {};
}

/** Workers 当日请求数 */
async function fetchWorkersUsage(env) {
  const acc = await queryAccount(env, Q_WORKERS);
  let requests = 0;
  for (const g of acc.workersInvocationsAdaptive || []) {
    requests += (g.sum && g.sum.requests) || 0;
  }
  return { requests };
}

/** D1 当日读/写查询次数 */
async function fetchD1Usage(env) {
  const acc = await queryAccount(env, Q_D1);
  let reads = 0, writes = 0;
  for (const g of acc.d1AnalyticsAdaptiveGroups || []) {
    const s = g.sum || {};
    reads += s.readQueries || 0;
    writes += s.writeQueries || 0;
  }
  return { reads, writes };
}

/**
 * 汇总额度（任一部分失败不影响其他；整体失败均置 configured:false）
 */
export async function fetchUsage(env) {
  const result = { fetchedAt: new Date().toISOString() };

  try {
    const { requests } = await fetchWorkersUsage(env);
    result.workers = {
      configured: true,
      requestsPerDay: PLAN_LIMITS.workersRequestsPerDay,
      todayRequests: requests,
    };
  } catch (e) {
    console.error('Workers usage query failed:', e.message);
    result.workers = { configured: false, message: e.message };
  }

  try {
    const { reads, writes } = await fetchD1Usage(env);
    result.d1 = {
      configured: true,
      todayReadQueries: reads,
      todayWriteQueries: writes,
      readRowsPerDay: PLAN_LIMITS.d1ReadRowsPerDay,
      writeRowsPerDay: PLAN_LIMITS.d1WriteRowsPerDay,
    };
  } catch (e) {
    console.error('D1 usage query failed:', e.message);
    result.d1 = { configured: false, message: e.message };
  }

  return result;
}
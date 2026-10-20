/**
 * GET /api/usage → Cloudflare Workers + D1 平台额度（免费档）
 */

import { jsonReply } from '../_utils/response.js';
import { fetchUsage } from '../_utils/usage-cf.js';

export async function handleUsage(env) {
  const usage = await fetchUsage(env);
  return jsonReply(usage, { cache: 'no-store' });
}
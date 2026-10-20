/**
 * /api/report → AI 分析报告（schema v3.0 契约，与 main 分支一致）
 * GET  /api/report                     → 最新报告（无则 { report:null }）
 * POST /api/report { key, payload }    → 上传/覆盖最新报告（EXPORT_KEY 鉴权）
 */

import { errorReply, jsonReply, getAdminKey, methodIs, readJsonBody } from '../_utils/response.js';
import { ensureSchema, getLatestReport, setLatestReport } from '../_utils/d1.js';

export async function handleReport(request, env) {
  await ensureSchema(env);

  if (methodIs(request, 'GET')) {
    const row = await getLatestReport(env);
    if (!row) return jsonReply({ report: null });
    let report = null;
    try { report = JSON.parse(row.payload); } catch { report = null; }
    return jsonReply({
      report,
      meta: { version: row.version, generatedAt: row.generated_at },
    }, { cache: 'no-cache' });
  }

  if (!methodIs(request, 'POST')) return errorReply('Method not allowed', 405);
  if (!getAdminKey(request, env)) return errorReply('管理密钥错误（EXPORT_KEY）', 403);

  let body = await readJsonBody(request);
  if (!body) return errorReply('请求体需为 JSON', 400);

  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || !payload.version) {
    return errorReply('payload 需包含 version 字段（schema v3.0，如 "3.0"）', 400);
  }

  await setLatestReport(env, payload);
  return jsonReply({ message: '报告已保存', version: payload.version, generatedAt: payload.generatedAt });
}
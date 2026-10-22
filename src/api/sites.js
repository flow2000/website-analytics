/**
 * GET /api/sites  → 站点列表（D1）
 * POST /api/sites → 添加网站（EXPORT_KEY 鉴权；自动解析 zone_id）
 * DELETE /api/sites → 删除网站（EXPORT_KEY 鉴权）
 * POST /api/sites?action=sync → 从 Cloudflare 全部导入（EXPORT_KEY 鉴权，需 Zone 读权限）
 */

import { errorReply, jsonReply, getQuery, methodIs, getAdminKey, readJsonBody } from '../_utils/response.js';
import { ensureSchema, listSites, upsertSite, removeSite } from '../_utils/d1.js';
import { resolveZonesByNames, listZonesViaRest } from '../_utils/cloudflare.js';

function shapeSites(sites) {
  return sites.map(s => ({ name: s.domain, zoneId: s.zone_id, status: s.status, plan: 'D1' }));
}

async function resolveSite(env, domain) {
  const zones = await resolveZonesByNames(env, [domain]);
  return zones[0] || null;
}

async function getSitesList(env) {
  await ensureSchema(env);
  let sites = await listSites(env);
  // D1 为空时自动从 Cloudflare 导入（与 /api/stats 一致），避免首次访问下拉框为空
  if (!sites.length) {
    try {
      const zones = await listZonesViaRest(env);
      for (const z of zones) await upsertSite(env, { domain: z.name, zone_id: z.zoneId, status: z.status });
      sites = await listSites(env);
    } catch (e) {
      console.error('sites 自动导入失败:', e.message);
    }
  }
  return sites;
}

export async function handleSites(request, env) {
  await ensureSchema(env);

  if (methodIs(request, 'OPTIONS')) return null; // 由 index 统一处理

  if (methodIs(request, 'GET')) {
    const sites = await getSitesList(env);
    return jsonReply({ total: sites.length, sites: shapeSites(sites) }, { cache: 'no-cache' });
  }

  // 管理操作：需 EXPORT_KEY
  if (methodIs(request, 'POST') || methodIs(request, 'DELETE')) {
    if (!getAdminKey(request, env)) {
      return errorReply('管理密钥错误（需配置 EXPORT_KEY 后携带 key 或 X-Admin-Key）', 403);
    }

    let body = await readJsonBody(request);
    if (!body) return errorReply('请求体需为 JSON', 400);
    const query = getQuery(request);
    const action = query.action || (query.sync === '1' ? 'sync' : body.action || 'add');
    const domain = String(body.domain || '').trim().toLowerCase();

    if (methodIs(request, 'DELETE')) {
      if (!domain) return errorReply('缺少 domain 参数', 400);
      await removeSite(env, domain);
      const sites = await getSitesList(env);
      return jsonReply({ total: sites.length, sites: shapeSites(sites) });
    }

    try {
      if (action === 'sync') {
        let imported = 0;
        try {
          const zones = await listZonesViaRest(env);
          for (const z of zones) await upsertSite(env, { domain: z.name, zone_id: z.zoneId, status: z.status });
          imported = zones.length;
        } catch (e) {
          return errorReply('自动同步失败：' + e.message + '（Token 可能缺少 Zone 读取权限，请改用手动添加）', 500);
        }
        const sites = await getSitesList(env);
        return jsonReply({ total: sites.length, imported, sites: shapeSites(sites) });
      }

      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
        return errorReply('域名格式不正确: ' + domain, 400);
      }

      let zoneId = body.zone_id || null;
      if (!zoneId) {
        const resolved = await resolveSite(env, domain);
        zoneId = resolved ? resolved.zoneId : null;
        if (!zoneId) return errorReply(`无法在 Cloudflare 解析域名 ${domain}（请确认域名的 Zone 属于该账户），已跳过`, 400);
      }
      await upsertSite(env, { domain, zone_id: zoneId, status: 'active' });
      const sites = await getSitesList(env);
      return jsonReply({ total: sites.length, sites: shapeSites(sites) });
    } catch (e) {
      console.error('sites admin error:', e);
      return errorReply('网站管理操作失败: ' + e.message, 500);
    }
  }

  return errorReply('Method not allowed', 405);
}
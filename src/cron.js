/**
 * Cron 触发器：每日 00:05 UTC 快照
 * - 回填近 30 天缺失的 daily_stats（httpRequests1dGroups）
 * - 补采 Visits / WAF 拦截按日数据（adaptive）
 */

import { ensureSchema, listSites, upsertDailyRows, getDailyRows, groupToRow, patchVisitsWaf } from './_utils/d1.js';
import {
  addDays, utcDateStr, fetchDailyGroups, fetchVisitsByDay, fetchWafByDay,
} from './_utils/cloudflare.js';

const BACKFILL_DAYS = 30;

export async function runScheduled(env) {
  console.log('[cron] 开始每日快照');
  await ensureSchema(env);
  const sites = await listSites(env);
  if (!sites.length) {
    console.log('[cron] 无站点，跳过');
    return;
  }
  const targets = sites.filter(s => s.zone_id);
  if (!targets.length) return;
  const zones = targets.map(s => ({ name: s.domain, zoneId: s.zone_id }));
  const today = utcDateStr(new Date());
  const yesterday = addDays(today, -1);
  const startDate = addDays(today, -(BACKFILL_DAYS - 1));

  // 1) 缺失日期回填（httpRequests1dGroups）
  const rows = await getDailyRows(env, targets.map(s => s.domain), startDate, yesterday);
  const present = new Set(rows.map(r => r.domain + '|' + r.date));
  const missing = [];
  for (let d = startDate; d <= yesterday; d = addDays(d, 1)) {
    for (const s of targets) if (!present.has(s.domain + '|' + d)) missing.push({ domain: s.domain, date: d });
  }
  if (missing.length) {
    const missMin = missing[0].date;
    const missMax = missing[missing.length - 1].date;
    try {
      const fetched = await fetchDailyGroups(env, zones, missMin, missMax);
      for (const zone of fetched) {
        const domain = zones.find(z => z.zoneId === zone.zoneTag)?.name || zone.zoneTag;
        const gs = zone.httpRequests1dGroups || [];
        if (gs.length) await upsertDailyRows(env, gs.map(g => groupToRow(domain, g)));
      }
      console.log(`[cron] 回填 1d 数据 ${missing.length} 条缺口（${missMin} ~ ${missMax}）`);
    } catch (e) {
      console.error('[cron] 回填失败:', e.message);
    }
  }

  // 2) Visits / WAF 按日补采（adaptive）
  try {
    const window = `${startDate}T00:00:00Z`; // 使用 startDate 覆盖整窗口（含 may > 保留期，降级空）
    const visits = await fetchVisitsByDay(env, zones, window, `${today}T00:00:00Z`);
    const waf = await fetchWafByDay(env, zones, window, `${today}T00:00:00Z`);
    // 写回 D1：仅写存在行数的日期区间
    for (let d = startDate; d <= yesterday; d = addDays(d, 1)) {
      const v = visits.byDay[d] || 0;
      const w = waf.byDay[d] || 0;
      if (v || w) {
        for (const s of targets) {
          const sv = (visits.byZone[s.zone_id] || {})[d] || 0;
          const sw = (waf.byZone[s.zone_id] || {})[d] || 0;
          if (sv || sw) await patchVisitsWaf(env, s.domain, d, { visits: sv, wafEvents: sw });
        }
      }
    }
    console.log('[cron] Visits/WAF 补采完成');
  } catch (e) {
    console.error('[cron] Visits/WAF 补采失败:', e.message);
  }

  console.log('[cron] 快照完成');
}
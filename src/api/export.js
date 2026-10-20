/**
 * GET /api/export?key=密码&site=<域名|all>&days=30&format=json|csv&start=&end=
 *
 * 导出站点统计数据（D1 快照优先，缺失日期实时回源）。
 * 密码通过 EXPORT_KEY 配置；未配置则不启用密码保护。
 * 输出结构与 main 分支一致（httpRequests1dGroups + 设备分布 + visits/waf 明细）。
 */

import { errorReply, fileReply, getQuery, getQueryStr, getQueryInt } from '../_utils/response.js';
import { ensureSchema, listSites, upsertSite, upsertDailyRows, getDailyRows, groupToRow, groupFromRow } from '../_utils/d1.js';
import {
  addDays, utcDateStr, fetchDailyGroups, fetchDeviceGroups,
  fetchVisitsByDay, fetchWafByDay, listZonesViaRest,
} from '../_utils/cloudflare.js';
import { generateCSV } from '../_utils/csv.js';

const DEVICE_SAMPLE_DAYS = 3;

function isValidDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }

export async function handleExport(request, env) {
  const query = getQuery(request);
  const key = getQueryStr(query, 'key');

  if (env.EXPORT_KEY && key !== env.EXPORT_KEY) {
    return errorReply('访问密码错误', 403);
  }

  try {
    const format = getQueryStr(query, 'format', 'json').toLowerCase();
    if (format !== 'json' && format !== 'csv') return errorReply(`不支持的导出格式: ${format}`, 400);

    const siteParam = getQueryStr(query, 'site');
    const days = getQueryInt(query, 'days', 30) || 30;
    const today = utcDateStr(new Date());
    const effectiveDays = Math.min(Math.max(days, 1), 92);
    const start = isValidDateStr(getQueryStr(query, 'start')) ? getQueryStr(query, 'start') : addDays(today, -(effectiveDays - 1));
    const end = isValidDateStr(getQueryStr(query, 'end')) ? getQueryStr(query, 'end') : today;
    const rangeStart = start <= end ? start : end;
    const rangeEnd = start <= end ? end : start;

    await ensureSchema(env);
    let sites = await listSites(env);
    if (!sites.length) {
      try {
        const zones = await listZonesViaRest(env);
        for (const z of zones) await upsertSite(env, { domain: z.name, zone_id: z.zoneId, status: z.status });
        sites = await listSites(env);
      } catch (e) { /* 保持空列表 */ }
    }
    const siteKey = (siteParam || 'all').toLowerCase();
    const targets = (siteKey === 'all' || siteKey === '')
      ? sites.filter(s => s.zone_id)
      : sites.filter(s => s.domain.toLowerCase() === siteKey || (s.zone_id && s.zone_id.toLowerCase() === siteKey));
    if (!targets.length) return errorReply(`站点不存在或无权访问: ${siteParam}`, 404);

    // 缺失日期批量回源（覆盖 [rangeStart, rangeEnd]）
    const rows = await getDailyRows(env, targets.map(s => s.domain), rangeStart, rangeEnd);
    const present = new Set(rows.map(r => r.domain + '|' + r.date));
    const missingDates = [];
    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
      for (const s of targets) if (!present.has(s.domain + '|' + d)) missingDates.push({ domain: s.domain, date: d });
    }
    if (missingDates.length) {
      const zones = targets.map(s => ({ name: s.domain, zoneId: s.zone_id }));
      const missMin = missingDates[0].date;
      const missMax = missingDates[missingDates.length - 1].date;
      try {
        const fetched = await fetchDailyGroups(env, zones, missMin, missMax);
        for (const zone of fetched) {
          const domain = zones.find(z => z.zoneId === zone.zoneTag)?.name || zone.zoneTag;
          const gs = zone.httpRequests1dGroups || [];
          if (gs.length) await upsertDailyRows(env, gs.map(g => groupToRow(domain, g)));
        }
      } catch (e) {
        console.error('export 回源缺失日期失败:', e.message);
      }
    }
    const rows2 = await getDailyRows(env, targets.map(s => s.domain), rangeStart, rangeEnd);

    // visits / waf 按日（D1 列 + 实时当日）
    const zones = targets.map(s => ({ name: s.domain, zoneId: s.zone_id }));
    const visitsByDate = {};
    const wafByDate = {};
    const rowsPerSite = new Map(targets.map(s => [s.domain, []]));
    for (const r of rows2) {
      const arr = rowsPerSite.get(r.domain) || [];
      arr.push(groupFromRow(r));
      visitsByDate[r.date] = (visitsByDate[r.date] || 0) + (r.visits || 0);
      wafByDate[r.date] = (wafByDate[r.date] || 0) + (r.waf_events || 0);
    }
    if (rangeStart <= today && today <= rangeEnd) {
      try {
        const nowIso = new Date().toISOString();
        const v = await fetchVisitsByDay(env, zones, `${today}T00:00:00Z`, nowIso);
        const w = await fetchWafByDay(env, zones, `${today}T00:00:00Z`, nowIso);
        for (const k of Object.keys(v.byDay)) visitsByDate[k] = (visitsByDate[k] || 0) + v.byDay[k];
        for (const k of Object.keys(w.byDay)) wafByDate[k] = (wafByDate[k] || 0) + w.byDay[k];
      } catch (e) { /* 降级 */ }
    }

    const deviceStartIso = new Date(Date.now() - Math.min(effectiveDays, DEVICE_SAMPLE_DAYS) * 86400000).toISOString();
    const deviceZoneResults = await fetchDeviceGroups(env, zones, deviceStartIso, new Date().toISOString());
    const devicesByZone = new Map(deviceZoneResults.map(z => [z.zoneTag, z.httpRequestsAdaptiveGroups || []]));

    const siteOuts = targets.map(s => {
      const groups = rowsPerSite.get(s.domain) || [];
      return {
        site: s.domain,
        zoneId: s.zone_id,
        datasets: {
          httpRequests1dGroups: groups,
          httpRequestsAdaptiveGroups_deviceTypes: devicesByZone.get(s.zone_id) || [],
        },
        visitsByDate,
        wafEventsByDate: wafByDate,
      };
    });

    if (format === 'csv') {
      const csvRows = [];
      for (const so of siteOuts) {
        for (const g of so.datasets.httpRequests1dGroups) {
          const s = g.sum || {};
          const u = g.uniq || {};
          const date = g.dimensions && g.dimensions.date;
          csvRows.push({
            site: so.site,
            date,
            requests: s.requests || 0,
            pageViews: s.pageViews || 0,
            uniques: u.uniques || 0,
            bytes: s.bytes || 0,
            cachedRequests: s.cachedRequests || 0,
            cachedBytes: s.cachedBytes || 0,
            uncachedRequests: Math.max(0, (s.requests || 0) - (s.cachedRequests || 0)),
            threats: s.threats || 0,
            encryptedRequests: s.encryptedRequests || 0,
            visits: visitsByDate[date] || 0,
            wafEvents: wafByDate[date] || 0,
          });
        }
      }
      csvRows.sort((a, b) => (a.site === b.site ? String(a.date).localeCompare(String(b.date)) : a.site.localeCompare(b.site)));
      return fileReply('\uFEFF' + generateCSV(csvRows), `cloudflare-analytics-export-${Date.now()}.csv`, 'text/csv; charset=utf-8');
    }

    const result = {
      exportedAt: new Date().toISOString(),
      source: 'Cloudflare GraphQL Analytics API (D1 snapshot)',
      queryInfo: {
        dataset: 'httpRequests1dGroups + httpRequestsAdaptiveGroups(visits) + firewallEventsAdaptiveGroups(waf)',
        date_geq: rangeStart,
        date_leq: rangeEnd,
        dateBasis: 'UTC',
        fields: ['requests', 'pageViews', 'bytes', 'threats', 'cachedBytes', 'cachedRequests',
          'encryptedBytes', 'encryptedRequests', 'countryMap', 'responseStatusMap', 'contentTypeMap',
          'browserMap', 'ipClassMap', 'clientSSLMap', 'threatPathingMap', 'uniq.uniques', 'visits', 'wafEvents'],
      },
      totalSites: siteOuts.length,
      totalRecords: siteOuts.reduce((n, s) => n + s.datasets.httpRequests1dGroups.length, 0),
      sites: siteOuts,
    };

    return fileReply(JSON.stringify(result), `cloudflare-analytics-export-${Date.now()}.json`, 'application/json; charset=utf-8');
  } catch (e) {
    console.error('export error:', e);
    return errorReply('导出失败: ' + e.message, 500);
  }
}
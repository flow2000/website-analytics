/**
 * GET /api/stats?site=<域名|all>&range=today|7d|30d
 *
 * 数据链路（D1 快照优先 + 实时回源）：
 * - today  ：实时 GraphQL（小时趋势 + 当日聚合 + 设备/Visits/WAF）
 * - 7d/30d ：过去日期读 D1 快照（缺日期回源 GraphQL 并 upsert），今日实时补齐
 *
 * 返回结构与 main 分支 /api/stats 保持一致，并新增：
 *   totals.visits / totals.wafEvents
 *   breakdowns.ipClasses / sslProtocols / threatPathing / wafActions / devices
 */

import { errorReply, jsonReply, getQuery, getQueryStr } from '../_utils/response.js';
import {
  ensureSchema, listSites, upsertSite, upsertDailyRows, getDailyRows,
  groupToRow, groupFromRow,
} from '../_utils/d1.js';
import {
  getRange, addDays, fetchDailyGroups, fetchHourlyGroups,
  fetchDeviceGroups, buildDailyStats, buildHourlyTrend, buildDeviceStats,
  fetchVisitsByDay, fetchFirewallEvents, listZonesViaRest, resolveZonesByNames,
} from '../_utils/cloudflare.js';

const DEVICE_SAMPLE_DAYS = 3;

/** 站点列表（D1 为空时自动导入 Cloudflare 全部站点；无 zone 的尽力解析） */
async function loadSites(env) {
  await ensureSchema(env);
  let sites = await listSites(env);
  if (!sites.length) {
    try {
      const zones = await listZonesViaRest(env);
      for (const z of zones) await upsertSite(env, { domain: z.name, zone_id: z.zoneId, status: z.status });
      sites = await listSites(env);
    } catch (e) {
      console.error('自动导入站点失败:', e.message);
    }
  }
  return sites;
}

async function ensureZoneIds(env, sites) {
  const missing = sites.filter(s => !s.zone_id);
  const resolved = await resolveZonesByNames(env, missing.map(s => s.domain));
  if (resolved.length) {
    for (const z of resolved) {
      await upsertSite(env, { domain: z.name, zone_id: z.zoneId, status: 'active' });
    }
    return listSites(env);
  }
  return sites;
}

/** 构造某站点某日零值行（回填缺失日期，避免重复回源） */
function zeroRow(domain, date) {
  return { domain, date, requests: 0, page_views: 0, uniques: 0, bytes: 0, threats: 0, cached_requests: 0, cached_bytes: 0, encrypted_requests: 0, encrypted_bytes: 0 };
}

function buildWafActionsList(byAction) {
  return Object.entries(byAction || {})
    .map(([name, requests]) => ({ name, requests }))
    .sort((a, b) => b.requests - a.requests);
}

export async function handleStats(request, env) {
  try {
    const query = getQuery(request);
    const siteParam = getQueryStr(query, 'site');
    const range = getRange(getQueryStr(query, 'range', '7d'));

    let sites = await loadSites(env);
    if (!sites.length) {
      return errorReply('尚未添加任何网站，请在「管理」中手动添加或自动同步（POST /api/sites）', 404);
    }
    sites = await ensureZoneIds(env, sites);

    const key = (siteParam || 'all').toLowerCase();
    const targets = (key === 'all' || key === '')
      ? sites.filter(s => s.zone_id)
      : sites.filter(s => s.domain.toLowerCase() === key || (s.zone_id && s.zone_id.toLowerCase() === key));
    if (!targets.length) return errorReply(`站点不存在或无权访问: ${siteParam}`, 404);

    const zones = targets.map(s => ({ name: s.domain, zoneId: s.zone_id }));
    const zoneNameById = new Map(zones.map(z => [z.zoneId, z.name]));
    const nowIso = new Date().toISOString();
    const generatedAt = nowIso;

    let stats;
    let hourly = [];
    let visitsLive = { byDay: {}, byZone: {} };
    let wafLive = { total: 0, byAction: {}, byZone: {} };
    let devices = [];

    if (range.key === 'today') {
      const dailyZoneResults = await fetchDailyGroups(env, zones, range.start, range.end);
      stats = buildDailyStats(dailyZoneResults, zoneNameById);
      const hourlyZoneResults = await fetchHourlyGroups(env, zones, `${range.start}T00:00:00Z`, nowIso);
      hourly = buildHourlyTrend(hourlyZoneResults);
      devices = buildDeviceStats(await fetchDeviceGroups(env, zones, `${range.start}T00:00:00Z`, nowIso));
      visitsLive = await fetchVisitsByDay(env, zones, `${range.start}T00:00:00Z`, nowIso);
      wafLive = await fetchFirewallEvents(env, zones, `${range.start}T00:00:00Z`, nowIso);
      stats.totals.visits = visitsLive.byDay[range.start] || 0;
      stats.totals.wafEvents = wafLive.total;
      for (const site of stats.perSite) {
        site.totals.visits = (visitsLive.byZone[site.zoneId] || {})[range.start] || 0;
        site.totals.wafEvents = wafLive.byZone[site.zoneId] || 0;
      }
    } else {
      // 过去日期（今日除外）读 D1 快照；缺失日期回源并入库
      const today = range.end;
      const yesterday = addDays(today, -1);
      const pastDates = [];
      for (let i = 0; i < range.days - 1; i++) pastDates.push(addDays(range.start, i));

      const domains = targets.map(s => s.domain);
      const rows = await getDailyRows(env, domains, range.start, yesterday);

      // 计算每个站点的缺失日期
      const presentByDomain = new Map(domains.map(d => [d, new Set()]));
      for (const r of rows) {
        const set = presentByDomain.get(r.domain);
        if (set) set.add(r.date);
      }
      let missingMin = null, missingMax = null;
      for (const [d, set] of presentByDomain) {
        for (const date of pastDates) {
          if (date >= today) continue;
          if (!set.has(date)) {
            if (!missingMin || date < missingMin) missingMin = date;
            if (!missingMax || date > missingMax) missingMax = date;
          }
        }
      }

      if (missingMin && missingMax) {
        const fetched = await fetchDailyGroups(env, zones, missingMin, missingMax);
        const fetchedByZone = new Map();
        for (const zone of fetched) {
          const domain = zones.find(z => z.zoneId === zone.zoneTag)?.name || zone.zoneTag;
          const gs = zone.httpRequests1dGroups || [];
          fetchedByZone.set(zone.zoneTag, new Set(gs.map(g => g.dimensions && g.dimensions.date)));
          await upsertDailyRows(env, gs.map(g => groupToRow(domain, g)));
        }
        // 仍未返回数据的日期写零值（防止每次请求重复回源）
        for (const [domain, set] of presentByDomain) {
          const site = targets.find(s => s.domain === domain);
          const zoneSet = site && site.zone_id ? fetchedByZone.get(site.zone_id) : new Set();
          const zeroRows = [];
          for (const date of pastDates) {
            if (!set.has(date) && zoneSet && !zoneSet.has(date)) zeroRows.push(zeroRow(domain, date));
          }
          if (zeroRows.length) await upsertDailyRows(env, zeroRows);
        }
      }

      // 今日实时（1d 聚合 + 设备 + Visits + WAF）
      const todayZoneResults = await fetchDailyGroups(env, zones, today, today);
      visitsLive = await fetchVisitsByDay(env, zones, `${today}T00:00:00Z`, nowIso);
      wafLive = await fetchFirewallEvents(env, zones, `${today}T00:00:00Z`, nowIso);
      const deviceWindowDays = Math.min(range.days, DEVICE_SAMPLE_DAYS);
      devices = buildDeviceStats(await fetchDeviceGroups(env, zones,
        new Date(Date.now() - deviceWindowDays * 86400000).toISOString(), nowIso));

      // 合并：D1 过去 + 今日实时 → 统一聚合
      const allRows = await getDailyRows(env, domains, range.start, yesterday);
      const todayGroups = new Map(todayZoneResults.map(z => [z.zoneTag, z.httpRequests1dGroups || []]));
      const zoneResults = targets.map(s => {
        const pastGroups = allRows
          .filter(r => r.domain === s.domain && r.date < today)
          .map(groupFromRow);
        const todayGs = todayGroups.get(s.zone_id) || [];
        return { zoneTag: s.zone_id, httpRequests1dGroups: [...pastGroups, ...todayGs] };
      });
      stats = buildDailyStats(zoneResults, zoneNameById);

      // Visits / WAF：过去（D1）+ 今日（实时）
      let grandVisits = 0, grandWaf = 0;
      const visitBySite = {}, wafBySite = {};
      for (const r of allRows) {
        if (r.date >= today) continue;
        grandVisits += r.visits || 0;
        grandWaf += r.waf_events || 0;
        visitBySite[r.domain] = (visitBySite[r.domain] || 0) + (r.visits || 0);
        wafBySite[r.domain] = (wafBySite[r.domain] || 0) + (r.waf_events || 0);
      }
      grandVisits += visitsLive.byDay[today] || 0;
      grandWaf += wafLive.total;
      for (const site of stats.perSite) {
        site.totals.visits = (visitBySite[site.name] || 0) + ((visitsLive.byZone[site.zoneId] || {})[today] || 0);
        site.totals.wafEvents = (wafBySite[site.name] || 0) + (wafLive.byZone[site.zoneId] || 0);
      }
      stats.totals.visits = grandVisits;
      stats.totals.wafEvents = grandWaf;
    }

    return jsonReply({
      range: range.key,
      rangeLabel: range.label,
      rangeDays: range.days,
      start: range.start,
      end: range.end,
      trendInterval: range.key === 'today' ? 'hour' : 'day',
      generatedAt,
      sites: zones.map(z => ({ name: z.name, zoneId: z.zoneId })),
      totals: stats.totals,
      trend: range.key === 'today' ? hourly : stats.trend,
      breakdowns: {
        ...stats.breakdowns,
        devices,
        devicesWindowDays: range.key === 'today' ? 1 : Math.min(range.days, DEVICE_SAMPLE_DAYS),
        wafActions: buildWafActionsList(wafLive.byAction),
      },
      perSite: stats.perSite,
    }, { cache: 'public, max-age=300' });
  } catch (e) {
    console.error('stats error:', e);
    return errorReply('获取统计数据失败: ' + e.message, 500);
  }
}
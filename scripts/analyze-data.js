/**
 * 网站数据分析脚本
 * 从 /workspace/export-data.json 读取所有站点的全部日期数据，
 * 生成 public/data/report.json
 */

const fs = require('fs');
const path = require('path');

const EXPORT_PATH = '/workspace/export-data.json';
const REPORT_PATH = path.join(__dirname, '..', 'public', 'data', 'report.json');

const raw = fs.readFileSync(EXPORT_PATH, 'utf8');
const exportData = JSON.parse(raw);

const todayStr = '2026-04-13'; // 固定生成日期为示例值
const generatedAt = new Date().toISOString();

// ========== 工具 ==========
function num(v, d = 0) {
  return typeof v === 'number' ? v : d;
}

function pct(v) {
  return Math.round(num(v) * 10000) / 100; // 0-100
}

function change(a, b) {
  if (!b || b === 0) return 0;
  return Math.round(((a - b) / b) * 10000) / 100;
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
}

function grade(site) {
  const br = site.today.bounceRate;
  const dur = site.today.avgDuration;
  if (br <= 40 && dur >= 60) return '优秀';
  if (br <= 60 && dur >= 30) return '良好';
  if (br <= 80) return '一般';
  return '待优化';
}

function levelByBounce(value) {
  if (value <= 40) return '理想';
  if (value <= 60) return '正常';
  if (value <= 80) return '偏高';
  return '偏高';
}

function levelByDuration(value) {
  if (value >= 60) return '理想';
  if (value >= 30) return '正常';
  return '偏短';
}

function levelByPvPerUv(value) {
  if (value >= 3) return '理想';
  if (value >= 2) return '正常';
  return '偏低';
}

function trendOf(series) {
  if (series.length < 2) return '平稳';
  const half = Math.floor(series.length / 2);
  const firstAvg = avg(series.slice(0, half));
  const secondAvg = avg(series.slice(half));
  if (firstAvg === 0) return '平稳';
  const diff = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (diff > 5) return '上升';
  if (diff < -5) return '下降';
  return '平稳';
}

// ========== 站点处理 ==========
function buildSite(siteExport) {
  const records = siteExport.records
    .map((r) => ({ date: r.date, data: r.data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // records 按日期升序，today 取最后一条（最新日期）
  const todayRec = records[records.length - 1];
  const yesterdayRec = records[records.length - 2] || todayRec;

  const today = {
    uv: num(todayRec.data.curUv),
    pv: num(todayRec.data.curPv),
    sv: num(todayRec.data.curSv),
    ip: num(todayRec.data.curIp),
    newUser: num(todayRec.data.curNewUserCount),
    bounceRate: pct(todayRec.data.curBounceRate),
    avgDuration: Math.round(num(todayRec.data.curAvgDuration) / 1000),
    pvPerUv: num(todayRec.data.curUv) > 0
      ? Math.round((num(todayRec.data.curPv) / num(todayRec.data.curUv)) * 100) / 100
      : 0
  };

  const yesterday = {
    uv: num(yesterdayRec.data.curUv),
    pv: num(yesterdayRec.data.curPv),
    sv: num(yesterdayRec.data.curSv),
    ip: num(yesterdayRec.data.curIp),
    newUser: num(yesterdayRec.data.curNewUserCount),
    bounceRate: pct(yesterdayRec.data.curBounceRate),
    avgDuration: Math.round(num(yesterdayRec.data.curAvgDuration) / 1000),
    pvPerUv: num(yesterdayRec.data.curUv) > 0
      ? Math.round((num(yesterdayRec.data.curPv) / num(yesterdayRec.data.curUv)) * 100) / 100
      : 0
  };

  const compare = {
    uvChange: change(today.uv, yesterday.uv),
    pvChange: change(today.pv, yesterday.pv),
    svChange: change(today.sv, yesterday.sv),
    ipChange: change(today.ip, yesterday.ip),
    newUserChange: change(today.newUser, yesterday.newUser)
  };

  const latest = records[records.length - 1].data;
  const cumulative = {
    monthUv: num(latest.monthUv),
    monthPv: num(latest.monthPv),
    monthBounceRate: pct(latest.monthBounceRate),
    totalUv: num(latest.totalUv),
    totalPv: num(latest.totalPv),
    totalBounceRate: pct(latest.totalBounceRate),
    topUv: num(latest.topUv),
    topPv: num(latest.topPv),
    topSv: num(latest.topSv),
    topUvDate: latest.topTimeUv || '',
    topPvDate: latest.topTimePv || ''
  };

  const quality = {
    bounceRate: {
      value: today.bounceRate,
      level: levelByBounce(today.bounceRate),
      change: change(today.bounceRate, yesterday.bounceRate)
    },
    avgDuration: {
      value: today.avgDuration,
      level: levelByDuration(today.avgDuration),
      change: change(today.avgDuration, yesterday.avgDuration)
    },
    pvPerUv: {
      value: today.pvPerUv,
      level: levelByPvPerUv(today.pvPerUv)
    }
  };

  const uvHistory = records.map((r) => num(r.data.curUv));
  const pvHistory = records.map((r) => num(r.data.curPv));
  const avgU = avg(uvHistory);
  const avgP = avg(pvHistory);

  const trend = {
    uvTrend: trendOf(uvHistory),
    pvTrend: trendOf(pvHistory),
    avgUv: avgU,
    avgPv: avgP,
    todayUvVsAvg: change(today.uv, avgU),
    todayPvVsAvg: change(today.pv, avgP),
    daysAnalyzed: records.length
  };

  const history = records.map((r) => ({
    date: r.date,
    uv: num(r.data.curUv),
    pv: num(r.data.curPv),
    sv: num(r.data.curSv),
    ip: num(r.data.curIp),
    bounceRate: pct(r.data.curBounceRate),
    avgDuration: Math.round(num(r.data.curAvgDuration) / 1000),
    newUser: num(r.data.curNewUserCount),
    pvPerUv: num(r.data.curUv) > 0
      ? Math.round((num(r.data.curPv) / num(r.data.curUv)) * 100) / 100
      : 0
  }));

  return {
    name: siteExport.site,
    today,
    yesterday,
    compare,
    cumulative,
    quality,
    trend,
    history,
    overallGrade: grade({ today })
  };
}

// ========== 主流程 ==========
const sites = exportData.sites.map(buildSite);
const allDates = [...new Set(exportData.sites.flatMap((s) => s.records.map((r) => r.date)))]
  .sort();

let totalUv = 0;
let totalPv = 0;
let bestSite = sites[0];
let weakestSite = sites[0];

sites.forEach((s) => {
  totalUv += s.today.uv;
  totalPv += s.today.pv;
  if (s.today.uv > bestSite.today.uv) bestSite = s;
  if (s.today.uv < weakestSite.today.uv) weakestSite = s;
});

const summary = {
  totalSites: sites.length,
  totalUv,
  totalPv,
  reportDays: allDates.length,
  bestSite: bestSite.name,
  bestGrade: bestSite.overallGrade,
  weakestSite: weakestSite.name,
  weakestGrade: weakestSite.overallGrade,
  dateRange: {
    start: allDates[0],
    end: allDates[allDates.length - 1]
  }
};

const report = {
  version: '1.0',
  generatedAt,
  generator: '51.LA Analytics Engine',
  dataSource: '51.LA Open API V6',
  summary,
  sites,
  dateRange: {
    start: allDates[0],
    end: allDates[allDates.length - 1],
    totalDays: allDates.length,
    allDates
  },
  rawSiteData: exportData.sites
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

console.log('✅ 已生成 report.json');
console.log('   站点数:', summary.totalSites);
console.log('   日期范围:', summary.dateRange.start, '~', summary.dateRange.end);
console.log('   每个站点历史天数:', sites[0].history.length);
console.log('   总记录数:', exportData.totalRecords);
console.log('   输出路径:', REPORT_PATH);
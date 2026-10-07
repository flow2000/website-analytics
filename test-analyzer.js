/**
 * 测试脚本 - 验证 analyzer.js 核心逻辑
 */

const {
  num, pct, change, avg, trendOf,
  levelByBounce, levelByDuration, levelByPvPerUv, overallGrade,
  buildSiteData, buildDayStats, buildOverviewData,
  generateSiteAIReport, generateOverviewAI
} = require('./api/_utils/analyzer');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name} - ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || '断言失败'}: 期望 ${expected}, 实际 ${actual}`);
  }
}

console.log('🧪 测试 analyzer.js 核心逻辑\n');

// ========== 工具函数测试 ==========
console.log('📐 工具函数');

test('num() - 数字原值返回', () => {
  assertEqual(num(42), 42);
});

test('num() - 非数字返回默认值', () => {
  assertEqual(num(undefined, 0), 0);
  assertEqual(num(null, 10), 10);
  assertEqual(num('abc', 5), 5);
});

test('pct() - 百分比转换', () => {
  assertEqual(pct(0.552), 55.2);
  assertEqual(pct(1), 100);
  assertEqual(pct(0), 0);
});

test('change() - 变化率计算', () => {
  assertEqual(change(120, 100), 20);
  assertEqual(change(80, 100), -20);
  assertEqual(change(100, 0), null);
});

test('avg() - 平均值计算', () => {
  assertEqual(avg([10, 20, 30]), 20);
  assertEqual(avg([5, 5, 5, 5]), 5);
  assertEqual(avg([]), 0);
});

test('trendOf() - 趋势判断', () => {
  assertEqual(trendOf([10, 20, 30, 40]), '上升');
  assertEqual(trendOf([40, 30, 20, 10]), '下降');
  assertEqual(trendOf([20, 21, 20, 21]), '平稳');
  assertEqual(trendOf([10]), '平稳');
});

// ========== 评级函数测试 ==========
console.log('\n🏆 评级函数');

test('levelByBounce() - 跳出率评级', () => {
  assertEqual(levelByBounce(25), '优秀');
  assertEqual(levelByBounce(40), '良好');
  assertEqual(levelByBounce(60), '一般');
  assertEqual(levelByBounce(80), '偏高');
});

test('levelByDuration() - 时长评级', () => {
  assertEqual(levelByDuration(200), '优秀');
  assertEqual(levelByDuration(100), '良好');
  assertEqual(levelByDuration(40), '一般');
  assertEqual(levelByDuration(10), '偏短');
});

test('levelByPvPerUv() - 人均页数评级', () => {
  assertEqual(levelByPvPerUv(4), '优秀');
  assertEqual(levelByPvPerUv(2), '良好');
  assertEqual(levelByPvPerUv(1), '一般');
});

test('overallGrade() - 综合评级', () => {
  assertEqual(overallGrade('优秀', '优秀', 4), '优秀');
  assertEqual(overallGrade('良好', '良好', 2), '良好');
  assertEqual(overallGrade('一般', '一般', 1.5), '一般');
  assertEqual(overallGrade('偏高', '偏短', 1), '待优化');
});

// ========== 单站点数据构建测试 ==========
console.log('\n📊 单站点数据构建');

// 生成模拟数据
function generateMockDay(uv, pv, bounceRate, avgDurationMs, dayIndex) {
  const beforeDay = `2026/10/${String(6 - dayIndex).padStart(2, '0')}`;
  return {
    curTime: '2026/10/07-2026/10/07',
    curUv: uv,
    curPv: pv,
    curSv: Math.round(uv * 1.2),
    curIp: Math.round(uv * 0.8),
    curNewUserCount: Math.round(uv * 0.3),
    curBounceRate: bounceRate,
    curAvgDuration: avgDurationMs,
    beforeTime: `${beforeDay}-${beforeDay}`,
    beforeUv: uv - 50,
    beforePv: pv - 100,
    beforeSv: Math.round((uv - 50) * 1.2),
    beforeIp: Math.round((uv - 50) * 0.8),
    beforeNewUserCount: Math.round((uv - 50) * 0.3),
    beforeBounceRate: bounceRate + 0.02,
    beforeAvgDuration: avgDurationMs - 5000,
    monthUv: uv * 30,
    monthPv: pv * 30,
    monthSv: Math.round(uv * 1.2 * 30),
    monthIp: Math.round(uv * 0.8 * 30),
    monthBounceRate: bounceRate,
    monthAvgDuration: avgDurationMs,
    totalUv: uv * 365,
    totalPv: pv * 365,
    totalSv: Math.round(uv * 1.2 * 365),
    totalIp: Math.round(uv * 0.8 * 365),
    totalBounceRate: bounceRate,
    totalAvgDuration: avgDurationMs,
    topUv: uv * 2,
    topTimeUv: '2026-09-15',
    topPv: pv * 2,
    topTimePv: '2026-09-20',
    topSv: Math.round(uv * 2 * 1.2),
    topTimeSv: '2026-09-18',
    topIp: Math.round(uv * 2 * 0.8),
    topTimeIp: '2026-09-16'
  };
}

const mockRecords = [
  { date: '2026-10-01', data: generateMockDay(800, 1800, 0.55, 65000, 0) },
  { date: '2026-10-02', data: generateMockDay(850, 1900, 0.52, 70000, 1) },
  { date: '2026-10-03', data: generateMockDay(900, 2000, 0.50, 72000, 2) },
  { date: '2026-10-04', data: generateMockDay(920, 2100, 0.48, 75000, 3) },
  { date: '2026-10-05', data: generateMockDay(950, 2200, 0.45, 78000, 4) },
  { date: '2026-10-06', data: generateMockDay(980, 2300, 0.42, 80000, 5) },
  { date: '2026-10-07', data: generateMockDay(1000, 2400, 0.40, 85000, 6) }
];

test('buildDayStats() - 单日数据构建', () => {
  const day = buildDayStats(mockRecords[0].data, '2026-09-30');
  // buildDayStats 使用 before* 字段: beforeUv = 800 - 50 = 750
  assertEqual(day.uv, 750);
  assertEqual(day.pv, 1700);
  assertEqual(day.date, '2026-09-30');
  assert(typeof day.bounceRate === 'number', 'bounceRate 应为数字');
  assert(typeof day.avgDuration === 'number', 'avgDuration 应为数字');
});

test('buildSiteData() - 站点数据完整构建', () => {
  const site = buildSiteData('example.com', mockRecords);
  assertEqual(site.name, 'example.com');
  assert(site.today !== null, 'today 不应为 null');
  assert(site.yesterday !== null, 'yesterday 不应为 null');
  assert(site.todayDate, 'todayDate 不应为空');
  assert(site.compareDate, 'compareDate 不应为空');
  // 7条记录，每条的 before* 都是完整数据，history 为 7 天
  assert(site.compare !== null, 'compare 不应为 null');
  assert(site.cumulative !== null, 'cumulative 不应为 null');
  assert(site.quality !== null, 'quality 不应为 null');
  assert(site.trend !== null, 'trend 不应为 null');
  assert(Array.isArray(site.history), 'history 应为数组');
  assertEqual(site.history.length, 7);
  assertEqual(site.trend.daysAnalyzed, 7);
  assert(typeof site.overallGrade === 'string', 'overallGrade 应为字符串');
});

test('buildSiteData() - 空数据处理', () => {
  const site = buildSiteData('empty.com', []);
  assertEqual(site.name, 'empty.com');
  assert(site.today === null, 'today 应为 null');
  assertEqual(site.overallGrade, '未知');
});

// ========== AI 报告生成测试 ==========
console.log('\n🤖 AI 报告生成');

test('generateSiteAIReport() - 生成单站点 AI 报告', () => {
  const site = buildSiteData('example.com', mockRecords);
  const report = generateSiteAIReport(site);
  assert(report !== null, '报告不应为 null');
  assert(typeof report.summary === 'string', 'summary 应为字符串');
  assert(Array.isArray(report.keyFindings), 'keyFindings 应为数组');
  assert(report.keyFindings.length > 0, 'keyFindings 不应为空');
  assert(Array.isArray(report.recommendations), 'recommendations 应为数组');
  assert(report.deepAnalysis !== null, 'deepAnalysis 不应为 null');
  assert(typeof report.trendOutlook === 'string', 'trendOutlook 应为字符串');
});

test('generateSiteAIReport() - 深度分析包含所有字段', () => {
  const site = buildSiteData('example.com', mockRecords);
  const report = generateSiteAIReport(site);
  const da = report.deepAnalysis;
  assert(typeof da.trafficPattern === 'string', 'trafficPattern 应为字符串');
  assert(typeof da.userBehavior === 'string', 'userBehavior 应为字符串');
  assert(typeof da.growthDrivers === 'string', 'growthDrivers 应为字符串');
  assert(Array.isArray(da.riskPoints), 'riskPoints 应为数组');
  assert(Array.isArray(da.actionPlan), 'actionPlan 应为数组');
  assertEqual(da.actionPlan.length, 3, 'actionPlan 应有 3 个阶段');
});

// ========== 总览数据测试 ==========
console.log('\n📈 总览数据');

const site1 = buildSiteData('site1.com', mockRecords);
const site2Records = mockRecords.map(r => ({
  date: r.date,
  data: generateMockDay(
    Math.round(r.data.curUv * 0.6),
    Math.round(r.data.curPv * 0.5),
    0.65,
    45000
  )
}));
const site2 = buildSiteData('site2.com', site2Records);

test('buildOverviewData() - 多站点总览构建', () => {
  const overview = buildOverviewData([site1, site2], 7);
  assertEqual(overview.totalSites, 2);
  assert(overview.totalUv > 0, 'totalUv 应大于 0');
  assert(overview.totalPv > 0, 'totalPv 应大于 0');
  assert(typeof overview.avgBounceRate === 'number', 'avgBounceRate 应为数字');
  assert(typeof overview.avgDuration === 'number', 'avgDuration 应为数字');
  assertEqual(overview.reportDays, 7);
  assertEqual(overview.bestSite, 'site1.com');
  assertEqual(overview.weakestSite, 'site2.com');
});

test('generateOverviewAI() - 多站点 AI 总览', () => {
  const overview = buildOverviewData([site1, site2], 7);
  const overallAI = generateOverviewAI([site1, site2], overview);
  assert(overallAI !== null, 'overallAI 不应为 null');
  assert(typeof overallAI.executiveSummary === 'string', 'executiveSummary 应为字符串');
  assert(overallAI.crossSiteComparison !== null, 'crossSiteComparison 不应为 null');
  assert(Array.isArray(overallAI.strategicRecommendations), 'strategicRecommendations 应为数组');
  assertEqual(overallAI.strategicRecommendations.length, 2);
});

// ========== 汇总 ==========
console.log('\n' + '='.repeat(50));
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);

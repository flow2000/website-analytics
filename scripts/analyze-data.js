/**
 * 网站数据分析脚本
 * 从导出的 JSON 文件读取所有站点数据，生成 public/data/report.json
 * 复用 api/_utils/analyzer.js 中的分析逻辑
 */

const fs = require('fs');
const path = require('path');

const { buildSiteData, buildOverviewData, generateSiteAIReport } = require('../api/_utils/analyzer');

const EXPORT_PATH = '/workspace/export-data.json';
const REPORT_PATH = path.join(__dirname, '..', 'public', 'data', 'report.json');

// ========== 主流程 ==========
function main() {
  const raw = fs.readFileSync(EXPORT_PATH, 'utf8');
  const exportData = JSON.parse(raw);

  const generatedAt = new Date().toISOString();

  // 构建各站点分析数据（复用 analyzer 的 buildSiteData）
  const sites = exportData.sites.map(siteExport => {
    const records = siteExport.records
      .map(r => ({ date: r.date, data: r.data }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return buildSiteData(siteExport.site, records);
  });

  // 计算总览数据
  const allDates = [...new Set(exportData.sites.flatMap(s => s.records.map(r => r.date)))]
    .sort();
  const overview = buildOverviewData(sites, allDates.length);

  // 为每个站点生成 AI 报告
  sites.forEach(site => {
    site.aiReport = generateSiteAIReport(site);
  });

  const report = {
    version: '2.0',
    generatedAt,
    generator: '51.LA Analytics Engine',
    dataSource: '51.LA Open API V6',
    days: allDates.length,
    overview,
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
  console.log('   站点数:', overview.totalSites);
  console.log('   日期范围:', allDates[0], '~', allDates[allDates.length - 1]);
  console.log('   每个站点历史天数:', sites[0]?.history.length || 0);
  console.log('   总记录数:', exportData.totalRecords);
  console.log('   输出路径:', REPORT_PATH);
}

try {
  main();
} catch (e) {
  console.error('❌ 生成报告失败:', e.message);
  process.exit(1);
}

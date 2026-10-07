/**
 * CSV 导出工具
 * 将 51.la 统计数据转换为 CSV 格式
 */

const { num, pct } = require('./analyzer');

const CSV_HEADERS = [
  'site', 'date', 'uv', 'pv', 'sv', 'ip', 'newUser',
  'bounceRate', 'avgDurationSec', 'pvPerUv',
  'beforeUv', 'beforePv', 'beforeSv', 'beforeIp',
  'monthUv', 'monthPv', 'totalUv', 'totalPv'
];

/**
 * 从记录数组生成 CSV 内容
 * @param {Array} records - 原始记录数组 [{ site, date, data }]
 * @returns {string} CSV 字符串
 */
function generateCSV(records) {
  const lines = [CSV_HEADERS.join(',')];

  for (const rec of records) {
    const d = rec.data || {};
    const uv = num(d.curUv);
    const pv = num(d.curPv);
    const bounceRate = d.curBounceRate != null ? pct(d.curBounceRate).toFixed(2) : '';
    const avgDur = d.curAvgDuration != null ? (num(d.curAvgDuration) / 1000).toFixed(2) : '';
    const pvPerUv = uv > 0 ? (pv / uv).toFixed(2) : '';

    lines.push([
      rec.site,
      rec.date,
      uv,
      pv,
      num(d.curSv),
      num(d.curIp),
      num(d.curNewUserCount),
      bounceRate,
      avgDur,
      pvPerUv,
      num(d.beforeUv),
      num(d.beforePv),
      num(d.beforeSv),
      num(d.beforeIp),
      num(d.monthUv),
      num(d.monthPv),
      num(d.totalUv),
      num(d.totalPv)
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = { generateCSV, CSV_HEADERS };

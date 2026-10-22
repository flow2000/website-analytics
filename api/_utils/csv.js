/**
 * CSV 导出工具
 * 将展平后的每日统计行生成 CSV（字段顺序固定，便于外部程序解析）
 */

const CSV_HEADERS = [
  'site', 'date', 'requests', 'pageViews', 'uniques', 'bytes',
  'cachedRequests', 'cachedBytes', 'uncachedRequests',
  'threats', 'encryptedRequests',
];

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {Array<object>} rows - cloudflare.flattenDailyRows 的输出
 * @returns {string} CSV 文本（不含 BOM，调用方负责）
 */
function generateCSV(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows || []) {
    lines.push(CSV_HEADERS.map(key => escapeCsvValue(row[key])).join(','));
  }
  return lines.join('\n');
}

module.exports = { generateCSV, CSV_HEADERS };

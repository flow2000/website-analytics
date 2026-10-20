/**
 * CSV 导出工具（Workers 版，移植自 main api/_utils/csv.js）
 */

export const CSV_HEADERS = [
  'site', 'date', 'requests', 'pageViews', 'uniques', 'bytes',
  'cachedRequests', 'cachedBytes', 'uncachedRequests',
  'threats', 'encryptedRequests', 'visits', 'wafEvents',
];

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function generateCSV(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows || []) {
    lines.push(CSV_HEADERS.map(key => escapeCsvValue(row[key])).join(','));
  }
  return lines.join('\n');
}
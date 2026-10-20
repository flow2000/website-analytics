/**
 * 上传 AI 分析报告到 /api/report（dev 分支，Cloudflare Workers）
 * 用法：node scripts/seed-report.js <report.json路径> [EXPORT_KEY] [API_BASE]
 * 示例：node scripts/seed-report.js report.json demo-key https://your-worker.workers.dev
 */
const fs = require('fs');

async function main() {
  const file = process.argv[2];
  const key = process.argv[3] || process.env.EXPORT_KEY || '';
  const base = process.argv[4] || process.env.API_BASE || 'http://localhost:8787';
  if (!file) {
    console.error('用法: node scripts/seed-report.js <report.json> [EXPORT_KEY] [API_BASE]');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(`${base}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
    body: JSON.stringify({ payload }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    console.error('上传失败:', body.message || res.status);
    process.exit(1);
  }
  console.log('报告已保存:', body.data.version, body.data.generatedAt);
}

main().catch(e => { console.error(e); process.exit(1); });
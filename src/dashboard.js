/** Worker 内嵌的前端页面源码（由 index.js 直接返回 text/html） */
export default `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>网站流量分析</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23f6821f'/%3E%3Cpath d='M36 6 14 38h14l-4 20 24-34H32l4-18z' fill='%23fff'/%3E%3C/svg%3E">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<style>
:root {
  --bg: #0b0f17; --bg-card: #131a26; --bg-elev: #1a2333; --bg-hover: #202b3e;
  --border: #232d3f; --text: #e6ebf4; --text-dim: #8b97ab;
  --accent: #f6821f; --accent-soft: rgba(246, 130, 31, 0.14);
  --success: #10b981; --warning: #f59e0b; --danger: #ef4444; --info: #3b82f6;
  --shadow: 0 8px 28px rgba(0, 0, 0, 0.35); --radius: 16px;
}
[data-theme="light"] {
  --bg: #f5f7fa; --bg-card: #ffffff; --bg-elev: #f0f3f8; --bg-hover: #e8edf4;
  --border: #e3e8ef; --text: #1a2233; --text-dim: #5d6b82;
  --accent: #ea7117; --accent-soft: rgba(246, 130, 31, 0.12);
  --shadow: 0 8px 24px rgba(15, 30, 60, 0.08);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); font-size: 16px; line-height: 1.65; min-height: 100vh;
  transition: background 0.25s, color 0.25s;
}
.wrap { max-width: 1320px; margin: 0 auto; padding: 28px 32px 60px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand-logo {
  width: 46px; height: 46px; border-radius: 12px; flex: none;
  background: linear-gradient(135deg, #f6821f, #fbad41);
  display: flex; align-items: center; justify-content: center; font-size: 24px; color: #fff;
  box-shadow: 0 4px 14px rgba(246, 130, 31, 0.35);
}
.brand h1 { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
.brand .sub { font-size: 13px; color: var(--text-dim); margin-top: 1px; }
.topbar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text);
  padding: 10px 18px; border-radius: 10px; font-size: 14.5px; cursor: pointer;
  transition: all 0.18s; font-family: inherit;
}
.btn:hover { background: var(--bg-hover); transform: translateY(-1px); }
.btn.primary { background: linear-gradient(135deg, #f6821f, #f59e0b); border-color: transparent; color: #fff; font-weight: 600; }
.btn.primary:hover { filter: brightness(1.06); }
.btn.danger { border-color: rgba(239,68,68,.5); color: var(--danger); }
.btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.controls {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px 20px; margin-bottom: 22px; box-shadow: var(--shadow);
}
.site-select {
  appearance: none; -webkit-appearance: none;
  background: var(--bg-elev) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238b97ab' d='M6 8 0 0h12z'/%3E%3C/svg%3E") no-repeat right 14px center;
  border: 1px solid var(--border); color: var(--text);
  padding: 10px 40px 10px 16px; border-radius: 10px; font-size: 15px; font-family: inherit;
  cursor: pointer; min-width: 220px;
}
.range-tabs { display: flex; background: var(--bg-elev); border-radius: 10px; padding: 4px; gap: 4px; }
.range-tabs button {
  border: none; background: transparent; color: var(--text-dim);
  padding: 8px 20px; border-radius: 8px; font-size: 14.5px; cursor: pointer;
  font-family: inherit; transition: all 0.18s; white-space: nowrap;
}
.range-tabs button.active { background: var(--accent); color: #fff; font-weight: 600; }
.range-tabs button:not(.active):hover { color: var(--text); }
.updated-at { margin-left: auto; font-size: 13px; color: var(--text-dim); }
.error-box {
  display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--text); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 22px; font-size: 14.5px;
}
.error-box b { color: var(--danger); }
.error-box .hint { color: var(--text-dim); margin-top: 6px; font-size: 13.5px; }

/* 额度 */
.quota-wrap { display: none; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 22px; margin-bottom: 22px; box-shadow: var(--shadow); }
.quota-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
.quota-card .q-label { font-size: 13.5px; color: var(--text-dim); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.quota-card .q-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; font-variant-numeric: tabular-nums; }
.quota-card .q-val { font-size: 20px; font-weight: 700; }
.quota-card .q-limit { font-size: 12.5px; color: var(--text-dim); }
.q-bar { height: 8px; background: var(--bg-elev); border-radius: 4px; overflow: hidden; }
.q-bar > i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), #fbbf24); transition: width .4s; }
.q-danger > i { background: linear-gradient(90deg, var(--danger), #f59e0b); }

/* KPI */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 22px; }
.kpi-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px 22px; box-shadow: var(--shadow); position: relative; overflow: hidden;
}
.kpi-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--kc, var(--accent)), transparent); }
.kpi-label { font-size: 13.5px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
.kpi-value { font-size: 30px; font-weight: 700; margin-top: 6px; letter-spacing: 0.3px; font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 12.5px; color: var(--text-dim); margin-top: 4px; }
.card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 24px 26px; box-shadow: var(--shadow); margin-bottom: 22px;
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.card-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.card-title .en { font-size: 12.5px; color: var(--text-dim); font-weight: 400; }
.card-note { font-size: 12.5px; color: var(--text-dim); }
.chart-box { position: relative; height: 340px; }
.chart-box.tall { height: 380px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--border); background: var(--bg-elev); color: var(--text-dim);
  padding: 6px 14px; border-radius: 999px; font-size: 13px; cursor: pointer;
  font-family: inherit; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;
}
.chip .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cc, var(--text-dim)); opacity: 0.4; }
.chip.active { color: var(--text); border-color: var(--cc, var(--accent)); background: var(--accent-soft); }
.chip.active .dot { opacity: 1; }
.grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; margin-bottom: 0; }
.grid-3 .card { margin-bottom: 0; }
.grid-2 { display: grid; grid-template-columns: 1.2fr 1fr; gap: 22px; margin-bottom: 22px; }
.grid-2 .card { margin-bottom: 0; }
@media (max-width: 980px) { .grid-2 { grid-template-columns: 1fr; } .grid-3 { grid-template-columns: 1fr; } }
.row-gap { margin-bottom: 22px; }
.rank-list { display: flex; flex-direction: column; gap: 12px; }
.rank-item { display: flex; flex-direction: column; gap: 5px; }
.rank-item .meta { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.rank-item .meta .val { color: var(--text-dim); font-size: 13px; font-variant-numeric: tabular-nums; }
.rank-bar-wrap { height: 8px; background: var(--bg-elev); border-radius: 4px; overflow: hidden; }
.rank-bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), #fbbf24); transition: width 0.4s; }
.table-wrap { overflow-x: auto; }
table.compare { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 640px; }
table.compare th, table.compare td { padding: 12px 14px; text-align: right; white-space: nowrap; }
table.compare th:first-child, table.compare td:first-child { text-align: left; }
table.compare thead th { color: var(--text-dim); font-weight: 500; font-size: 13px; border-bottom: 1px solid var(--border); }
table.compare tbody tr { border-bottom: 1px solid var(--border); }
table.compare tbody tr:last-child { border-bottom: none; }
table.compare tbody tr:hover { background: var(--bg-hover); }
table.compare td { font-variant-numeric: tabular-nums; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.b-success { background: rgba(16, 185, 129, 0.15); color: var(--success); }
.badge.b-warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
.badge.b-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
.badge.b-info { background: rgba(59, 130, 246, 0.15); color: var(--info); }

/* AI 报告 */
.report-meta { font-size: 12.5px; color: var(--text-dim); }
.report-summary {
  background: var(--accent-soft); border: 1px solid rgba(246, 130, 31, 0.3);
  border-radius: 12px; padding: 16px 20px; font-size: 15px; margin-bottom: 20px;
}
.report-grade { vertical-align: middle; margin-left: 8px; }
.findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 22px; }
.finding { background: var(--bg-elev); border-radius: 10px; padding: 12px 16px; font-size: 14px; display: flex; gap: 9px; align-items: flex-start; }
.rec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 22px; }
.rec-card { border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; background: var(--bg-elev); }
.rec-card .rec-title { font-weight: 700; font-size: 14.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.rec-card .rec-detail { font-size: 13.5px; color: var(--text-dim); }
.rec-success { border-left: 3px solid var(--success); }
.rec-warning { border-left: 3px solid var(--warning); }
.rec-info { border-left: 3px solid var(--info); }
.deep-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
.deep-item h4 { font-size: 14px; color: var(--accent); margin-bottom: 6px; display: flex; align-items: center; gap: 7px; }
.deep-item p, .deep-item li { font-size: 14px; color: var(--text-dim); }
.deep-item ul { padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.outlook { background: var(--bg-elev); border-radius: 12px; padding: 14px 18px; font-size: 14px; border-left: 3px solid var(--accent); }
.site-chip-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
.report-missing {
  text-align: center; color: var(--text-dim); font-size: 14px; padding: 28px 20px;
  border: 1px dashed var(--border); border-radius: 12px; line-height: 2;
}
.report-missing code { background: var(--bg-elev); padding: 2px 8px; border-radius: 6px; font-size: 13px; }
.empty-state { text-align: center; color: var(--text-dim); padding: 70px 20px; font-size: 15px; }
.loading-bar {
  display: none; position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 200;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 40% 100%; background-repeat: no-repeat;
  animation: slide 1.1s linear infinite;
}
@keyframes slide { 0% { background-position: -40% 0; } 100% { background-position: 140% 0; } }
.modal-mask {
  display: none; position: fixed; inset: 0; background: rgba(4, 8, 16, 0.6);
  backdrop-filter: blur(3px); z-index: 300; align-items: center; justify-content: center; padding: 20px;
}
.modal-mask.show { display: flex; }
.modal {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  width: 100%; max-width: 480px; max-height: 86vh; overflow-y: auto;
  padding: 26px 28px; box-shadow: var(--shadow);
}
.modal h3 { font-size: 18px; margin-bottom: 6px; }
.modal .desc { font-size: 13.5px; color: var(--text-dim); margin-bottom: 14px; }
.modal .sec-title { font-size: 13px; font-weight: 700; color: var(--accent); margin: 18px 0 8px; letter-spacing: .5px; }
.modal label { display: block; font-size: 13.5px; color: var(--text-dim); margin: 12px 0 6px; }
.modal input[type="text"], .modal input[type="password"], .modal select {
  width: 100%; background: var(--bg-elev); border: 1px solid var(--border); color: var(--text);
  border-radius: 10px; padding: 11px 14px; font-size: 14.5px; font-family: inherit; outline: none;
}
.modal input:focus, .modal select:focus { border-color: var(--accent); }
.modal .format-row { display: flex; gap: 10px; }
.modal .format-row .chip { flex: 1; justify-content: center; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
.modal .hint { font-size: 12.5px; color: var(--text-dim); margin-top: 6px; line-height: 1.7; }
.admin-site-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; background: var(--bg-elev); border-radius: 9px; margin-bottom: 8px; font-size: 14px; }
.admin-site-item .dom { font-weight: 600; }
.admin-site-item .del { color: var(--danger); cursor: pointer; border: none; background: none; font-size: 14px; }
.totp-area { margin-top: 10px; padding: 12px 14px; background: var(--bg-elev); border-radius: 10px; display: none; }
.totp-area .qr-box { display: flex; justify-content: center; margin: 10px 0; }
.totp-area .qr-box svg, .totp-area .qr-box img { width: 168px; height: 168px; border-radius: 8px; background: #fff; padding: 6px; }
.qr-fallback { font-size: 12.5px; color: var(--text-dim); word-break: break-all; margin: 6px 0; }
footer { text-align: center; color: var(--text-dim); font-size: 12.5px; margin-top: 34px; line-height: 2; }
footer a { color: var(--text-dim); }
.footer-links a { text-decoration: none; border-bottom: 1px dashed transparent; transition: color .18s, border-color .18s; }
.footer-links a:hover { color: var(--accent); border-bottom-color: var(--accent); }
button { touch-action: manipulation; }
.card { transition: border-color .2s, transform .2s, box-shadow .2s; }
.card:hover { box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28); }
.range-tabs button.active { background: linear-gradient(135deg, #f6821f, #f59e0b); box-shadow: 0 2px 10px rgba(246, 130, 31, 0.35); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
::selection { background: var(--accent-soft); }

/* ===== 交互反馈 ===== */
.btn:active { transform: translateY(0) scale(0.98); }
.rank-item { padding: 4px 6px; margin: -4px -6px; border-radius: 10px; transition: background 0.15s; }
.rank-item:hover { background: var(--bg-hover); }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.path-name { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; word-break: break-all; }
.rank-no { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text-dim); background: var(--bg-elev); border-radius: 6px; }
.medal { display: inline-flex; width: 22px; align-items: center; justify-content: center; font-size: 15px; }
.modal { animation: pop 0.18s ease; }
@keyframes pop { from { opacity: 0; transform: scale(0.96) translateY(6px); } }

/* ===== 移动端适配 ===== */
@media (max-width: 900px) {
  .controls { padding: 12px 14px; gap: 10px; }
  .site-select { min-width: 0; flex: 1; }
  .range-tabs { width: 100%; overflow-x: auto; }
  .range-tabs button { flex: 1; min-width: 76px; }
  .updated-at { margin-left: 0; width: 100%; font-size: 12px; line-height: 1.6; }
}
@media (max-width: 640px) {
  .wrap { padding: 14px 12px 36px; }
  .topbar { gap: 12px; }
  .topbar-actions { width: 100%; }
  .topbar-actions .btn { flex: 1; justify-content: center; padding: 10px 6px; font-size: 13px; }
  .brand h1 { font-size: 18px; }
  .brand .sub { font-size: 11.5px; }
  .brand-logo { width: 40px; height: 40px; font-size: 20px; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .kpi-card { padding: 14px; }
  .kpi-value { font-size: 22px; }
  .kpi-sub { font-size: 11px; }
  .card { padding: 18px 14px; border-radius: 14px; }
  .chart-box { height: 250px; }
  .chart-box.tall { height: 280px; }
  .rank-item .meta { font-size: 13px; }
  .grid-3, .grid-2 { gap: 14px; }
  .findings, .rec-grid, .deep-grid { grid-template-columns: 1fr; }
  .modal { padding: 20px 16px; }
  .modal .format-row { flex-direction: column; }
  .modal .format-row .chip { flex: none; }
  table.compare { min-width: 560px; }
  .report-summary { padding: 14px 16px; font-size: 14px; }
  footer { font-size: 11.5px; }
}
@media (max-width: 380px) {
  .kpi-value { font-size: 19px; }
  .btn { padding: 9px 5px; }
}
</style>
</head>
<body>
<div class="loading-bar" id="loadingBar"></div>
<div class="wrap">
  <header class="topbar">
    <div class="brand">
      <div class="brand-logo">⚡</div>
      <div>
        <h1>网站流量分析</h1>
        <div class="sub">GraphQL Analytics · D1 快照 · 多站点</div>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="btn" id="btnUsage" title="查看 Workers / D1 请求额度">📊 额度</button>
      <button class="btn" id="btnAdmin" title="管理：网站/访问控制">⚙️ 管理</button>
      <button class="btn primary" id="btnExport">📤 导出近30天数据</button>
      <button class="btn" id="btnTheme" title="切换明暗主题">🌙</button>
    </div>
  </header>

  <div class="controls">
    <select class="site-select" id="siteSelect" title="选择站点"></select>
    <div class="range-tabs" id="rangeTabs">
      <button data-range="today">今天</button>
      <button data-range="7d" class="active">近7天</button>
      <button data-range="30d">近30天</button>
    </div>
    <div class="updated-at" id="updatedAt"></div>
  </div>

  <div class="quota-wrap" id="quotaWrap">
    <div class="card-head" style="margin-bottom:12px">
      <div class="card-title">📊 平台请求额度 <span class="en">Workers · D1（免费档，UTC 当日）</span></div>
      <div class="card-note" id="quotaNote"></div>
    </div>
    <div class="quota-cards" id="quotaCards"></div>
  </div>

  <div class="error-box" id="errorBox"></div>

  <section class="kpi-grid" id="kpiGrid"></section>

  <section class="card">
    <div class="card-head">
      <div class="card-title">📈 流量趋势 <span class="en" id="trendInterval"></span></div>
      <div class="chips" id="trendChips"></div>
    </div>
    <div class="chart-box tall"><canvas id="trendChart"></canvas></div>
    <div class="empty-state" id="trendEmpty" style="display:none">所选范围内暂无数据</div>
  </section>

  <div class="grid-3 row-gap">
    <section class="card">
      <div class="card-head">
        <div class="card-title">💾 缓存状态</div>
        <div class="card-note">命中率 <b id="cacheHitText">-</b></div>
      </div>
      <div class="chart-box"><canvas id="cacheChart"></canvas><div class="empty-state" id="cacheEmpty" style="display:none; padding:60px 10px">暂无数据</div></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">📱 设备类型</div>
        <div class="card-note" id="deviceNote"></div>
      </div>
      <div class="chart-box"><canvas id="deviceChart"></canvas><div class="empty-state" id="deviceEmpty" style="display:none; padding:60px 10px">暂无设备类型数据</div></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">📊 状态码分布</div>
        <div class="card-note">边缘响应</div>
      </div>
      <div class="chart-box"><canvas id="statusChart"></canvas><div class="empty-state" id="statusEmpty" style="display:none; padding:60px 10px">暂无状态码数据</div></div>
    </section>
  </div>

  <div class="grid-2 row-gap">
    <section class="card">
      <div class="card-head">
        <div class="card-title">🌍 国家/地区 Top 5</div>
        <div class="card-note">按请求数排序</div>
      </div>
      <div class="rank-list" id="countryList"></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">🧩 内容类型 &amp; 浏览器</div>
        <div class="card-note">按请求数 / 浏览量排序</div>
      </div>
      <h4 style="font-size:14px;color:var(--text-dim);margin-bottom:12px">内容类型</h4>
      <div class="rank-list" id="contentTypeList" style="margin-bottom:22px"></div>
      <h4 style="font-size:14px;color:var(--text-dim);margin-bottom:12px">浏览器（按页面浏览）</h4>
      <div class="rank-list" id="browserList"></div>
    </section>
  </div>

  <div class="grid-3 row-gap">
    <section class="card">
      <div class="card-head">
        <div class="card-title">🕵️ 流量来源分类</div>
        <div class="card-note">ipClass：真实访客 / 爬虫 / 监控</div>
      </div>
      <div class="rank-list" id="ipClassList"></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">🔒 TLS 协议版本</div>
        <div class="card-note">按请求数</div>
      </div>
      <div class="rank-list" id="sslList"></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">🛡️ 威胁拦截 &amp; WAF</div>
        <div class="card-note">威胁细分 + 防火墙动作</div>
      </div>
      <h4 style="font-size:14px;color:var(--text-dim);margin-bottom:12px">威胁类型</h4>
      <div class="rank-list" id="threatList" style="margin-bottom:22px"></div>
      <h4 style="font-size:14px;color:var(--text-dim);margin-bottom:12px">WAF 动作（今日实时）</h4>
      <div class="rank-list" id="wafList"></div>
    </section>
  </div>

  <div class="grid-3 row-gap">
    <section class="card" id="siteRankCard" style="display:none">
      <div class="card-head">
        <div class="card-title">🏆 热门站点排行</div>
        <div class="chips" id="rankChips"></div>
      </div>
      <div class="rank-list" id="siteRankList"></div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">📄 热门页面 Top 5</div>
        <div class="card-note" id="topPagesNote"></div>
      </div>
      <div class="rank-list" id="topPagesList"></div>
    </section>
  </div>

  <section class="card" id="compareCard" style="display:none">
    <div class="card-head">
      <div class="card-title">🏢 多站点对比</div>
      <div class="card-note" id="compareNote"></div>
    </div>
    <div class="table-wrap">
      <table class="compare" id="compareTable"></table>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <div class="card-title">🤖 AI 智能分析报告</div>
      <div class="report-meta" id="reportMeta"></div>
    </div>
    <div id="reportBody"></div>
  </section>

  <footer>
    <div class="footer-links"><a href="https://github.com/flow2000/website-analytics" target="_blank" rel="noopener">⭐ GitHub · flow2000/website-analytics</a></div>
    数据来源：Cloudflare GraphQL Analytics API · 趋势日期口径为 UTC，界面时间按本地时区（<span id="footTz">…</span>）显示 · 「今天」含未结束的部分数据<br>
    历史数据每日快照至 D1 · 分析报告 GET/POST <code>/api/report</code>（schema v3.0，由外部程序上传）· 原始数据导出：<code>/api/export</code>
  </footer>
</div>

<!-- 导出弹窗 -->
<div class="modal-mask" id="exportModal">
  <div class="modal">
    <h3>📤 导出原始数据</h3>
    <div class="desc">导出范围数据（默认近 30 天），供外部程序分析并生成 report.json 后 POST 到 /api/report。</div>
    <label>站点范围</label>
    <input type="text" id="exportSite" readonly>
    <label>导出格式</label>
    <div class="format-row">
      <button class="chip active" data-format="json"><span class="dot" style="--cc:#3b82f6"></span>JSON（完整明细）</button>
      <button class="chip" data-format="csv"><span class="dot" style="--cc:#10b981"></span>CSV（每日汇总）</button>
    </div>
    <label>访问密码（服务端配置了 EXPORT_KEY 时必填）</label>
    <input type="password" id="exportKey" placeholder="未设置密码保护可留空">
    <div class="modal-actions">
      <button class="btn" id="exportCancel">取消</button>
      <button class="btn primary" id="exportConfirm">开始导出</button>
    </div>
  </div>
</div>

<!-- 认证弹窗（全局访问控制） -->
<div class="modal-mask" id="authModal">
  <div class="modal">
    <h3 id="authTitle">🔐 访问认证</h3>
    <div class="desc" id="authDesc"></div>
    <div class="format-row" id="authModeRow" style="margin:12px 0">
      <button class="chip active" data-amode="password">访问密码</button>
      <button class="chip" data-amode="totp">APP 验证码</button>
    </div>
    <label>密码 / 6 位验证码</label>
    <input type="password" id="authCode" placeholder="" autofocus>
    <div class="modal-actions">
      <button class="btn primary" id="authConfirm">登录进入</button>
    </div>
  </div>
</div>

<!-- 管理弹窗 -->
<div class="modal-mask" id="adminModal">
  <div class="modal">
    <h3>⚙️ 管理</h3>
    <div class="desc">网站管理 &amp; 全局访问控制。操作需管理密钥（EXPORT_KEY）。</div>
    <label>管理密钥</label>
    <input type="password" id="adminKey" placeholder="EXPORT_KEY">
    <div class="sec-title">网站管理</div>
    <div class="format-row" style="margin-bottom:10px">
      <input type="text" id="siteDomain" placeholder="example.com" style="flex:1">
      <button class="btn primary" id="btnAddSite">➕ 添加</button>
      <button class="btn" id="btnSyncSites">🔄 同步</button>
    </div>
    <div id="adminSiteList"></div>
    <div class="sec-title">全局访问控制</div>
    <label>访问模式</label>
    <select id="accessMode">
      <option value="none">🔓 公开（无需认证）</option>
      <option value="password">🔑 访问密码</option>
      <option value="totp">📱 APP 二次验证 (TOTP)</option>
    </select>
    <div id="pwArea" style="display:none">
      <label>设置访问密码（≥4 位）</label>
      <input type="password" id="newPassword" placeholder="输入新密码">
      <div class="hint">保存后立即生效，查看数据需输入该密码。</div>
    </div>
    <div id="totpArea" style="display:none">
      <div class="format-row" style="margin:10px 0">
        <button class="btn primary" id="btnTotpNew">🎫 生成密钥</button>
      </div>
      <div class="totp-area" id="totpBindArea">
        <div class="hint">用认证器 App（如 Google Authenticator / 1Password）扫描二维码，或手动输入密钥：</div>
        <div class="qr-fallback" id="totpSecretText"></div>
        <div class="qr-box" id="totpQr"></div>
        <label>输入 App 显示的 6 位验证码以启用</label>
        <input type="text" id="totpCode" maxlength="6" placeholder="6 位验证码">
        <div class="modal-actions" style="margin-top:10px">
          <button class="btn primary" id="btnTotpVerify">验证并启用</button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="btnAccessDisable">关闭访问控制</button>
      <button class="btn primary" id="btnSaveAccess">保存访问设置</button>
    </div>
  </div>
</div>

<script>
/* ==================== 国家/地区中文名映射 ==================== */
const COUNTRY_ZH = {
  CN:"中国",US:"美国",JP:"日本",HK:"中国香港",TW:"中国台湾",SG:"新加坡",KR:"韩国",DE:"德国",GB:"英国",FR:"法国",
  CA:"加拿大",AU:"澳大利亚",RU:"俄罗斯",IN:"印度",BR:"巴西",NL:"荷兰",MY:"马来西亚",TH:"泰国",VN:"越南",PH:"菲律宾",
  ID:"印度尼西亚",IT:"意大利",ES:"西班牙",SE:"瑞典",CH:"瑞士",AT:"奥地利",BE:"比利时",DK:"丹麦",FI:"芬兰",NO:"挪威",
  IE:"爱尔兰",PT:"葡萄牙",PL:"波兰",CZ:"捷克",GR:"希腊",HU:"匈牙利",RO:"罗马尼亚",UA:"乌克兰",TR:"土耳其",IL:"以色列",
  AE:"阿联酋",SA:"沙特阿拉伯",QA:"卡塔尔",EG:"埃及",ZA:"南非",NG:"尼日利亚",KE:"肯尼亚",MA:"摩洛哥",MX:"墨西哥",AR:"阿根廷",
  CL:"智利",CO:"哥伦比亚",PE:"秘鲁",NZ:"新西兰",PK:"巴基斯坦",BD:"孟加拉国",LK:"斯里兰卡",NP:"尼泊尔",KH:"柬埔寨",MM:"缅甸",
  LA:"老挝",MN:"蒙古",KZ:"哈萨克斯坦",UZ:"乌兹别克斯坦",BG:"保加利亚",HR:"克罗地亚",RS:"塞尔维亚",SK:"斯洛伐克",SI:"斯洛文尼亚",LT:"立陶宛",
  LV:"拉脱维亚",EE:"爱沙尼亚",IS:"冰岛",LU:"卢森堡",MT:"马耳他",CY:"塞浦路斯",GE:"格鲁吉亚",AM:"亚美尼亚",AZ:"阿塞拜疆",BY:"白俄罗斯",
  MD:"摩尔多瓦",AL:"阿尔巴尼亚",MK:"北马其顿",BA:"波黑",JO:"约旦",LB:"黎巴嫩",KW:"科威特",BH:"巴林",OM:"阿曼",IQ:"伊拉克",
  IR:"伊朗",AF:"阿富汗",TJ:"塔吉克斯坦",KG:"吉尔吉斯斯坦",TM:"土库曼斯坦",MV:"马尔代夫",BT:"不丹",BN:"文莱",PA:"巴拿马",
  CR:"哥斯达黎加",GT:"危地马拉",CU:"古巴",DO:"多米尼加",JM:"牙买加",TT:"特立尼达和多巴哥",PR:"波多黎各",EC:"厄瓜多尔",UY:"乌拉圭",BO:"玻利维亚",
  PY:"巴拉圭",VE:"委内瑞拉",HN:"洪都拉斯",NI:"尼加拉瓜",SV:"萨尔瓦多",BZ:"伯利兹",GY:"圭亚那",SR:"苏里南",BS:"巴哈马",BB:"巴巴多斯",
  TZ:"坦桑尼亚",UG:"乌干达",GH:"加纳",ET:"埃塞俄比亚",DZ:"阿尔及利亚",TN:"突尼斯",LY:"利比亚",SD:"苏丹",CM:"喀麦隆",CI:"科特迪瓦",
  SN:"塞内加尔",ZM:"赞比亚",ZW:"津巴布韦",MZ:"莫桑比克",BW:"博茨瓦纳",NA:"纳米比亚",MG:"马达加斯加",MU:"毛里求斯",AO:"安哥拉",RW:"卢旺达",
  FJ:"斐济",PG:"巴布亚新几内亚",NC:"新喀里多尼亚",PF:"法属波利尼西亚",WS:"萨摩亚",TO:"汤加",VU:"瓦努阿图",SB:"所罗门群岛",GL:"格陵兰"
};
function countryName(code) { if (!code) return "未知"; return COUNTRY_ZH[String(code).toUpperCase()] || code; }
function countryFlag(code) {
  if (!code || String(code).length !== 2) return "🏳️";
  try { return String(code).toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0))); }
  catch (_) { return "🏳️"; }
}

/* ==================== 格式化工具 ==================== */
function fmtInt(n) { return (n || 0).toLocaleString("zh-CN"); }
function fmtCompact(n) {
  n = n || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return fmtInt(n);
}
function fmtBytes(n) {
  n = n || 0;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : 1)) + " " + units[i];
}
function fmtPct(n) { return (n || 0).toFixed(1) + "%"; }
const PALETTE = ["#f6821f", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];
const LOCAL_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } })();
function tzOffset() {
  try {
    const off = -new Date().getTimezoneOffset() / 60;
    return "UTC" + (off >= 0 ? "+" : "") + off;
  } catch (_) { return ""; }
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  try { return d.toLocaleString("zh-CN", { hour12: false, timeZone: LOCAL_TZ }); }
  catch (_) { return d.toLocaleString("zh-CN", { hour12: false }); }
}
function fmtHour(iso) {
  return String(new Date(iso).getHours()).padStart(2, "0") + ":00";
}
const DEVICE_ZH = { desktop: "桌面端", mobile: "移动端", tablet: "平板", other: "其他" };
const IPCLASS_ZH = {
  visitor: "真实访客", searchEngine: "搜索引擎爬虫", monitoringService: "监控服务", malware: "恶意程序",
  honeyPot: "蜜罐", lure: "诱饵", nonRoutable: "内网/不可路由", notRobust: "非稳健(代理)", antiBotUndefined: "反爬未定义",
  noRecord: "无记录", otherHost: "其他主机"
};
const IPCLASS_ICON = { visitor: "👤", searchEngine: "🔍", monitoringService: "🛰️", malware: "☠️", honeyPot: "🍯", noRecord: "❓" };
const SSL_ZH = {
  "TLSv1.3": "TLS 1.3", "TLSv1.2": "TLS 1.2", "TLSv1.1": "TLS 1.1", "TLSv1.0": "TLS 1.0",
  "SSLv3": "SSLv3", "none": "HTTP(明文)", "NONE": "HTTP(明文)"
};
const THREAT_ICON = { "user.ban": "🚫", "user.ban.ctry": "🌐", "user.ban.ip": "📌", "user.ban.ip.rang": "📡", "user.ban.asn": "🏢" };
const WAF_ZH = {
  block: "拦截 Block", challenge: "质询 Challenge", js_challenge: "JS 质询", managed_challenge: "托管质询",
  log: "仅记录", allow: "放行", skip: "跳过", error: "错误", off: "关闭", unknown: "未知"
};

/* ==================== 全局状态 ==================== */
const STATE = { sites: [], site: "all", range: "7d", stats: null, report: null, trendMetrics: new Set(["requests", "pageViews"]), charts: {}, needsAuth: false, authMode: "password", rankMetric: "requests" };

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => map[c]);
}

function api(url, opts) {
  return fetch(url, opts).then(async res => {
    const body = await res.json().catch(() => null);
    if (res.status === 401) { STATE.needsAuth = true; openAuth(); throw new Error((body && body.message) || "需要认证"); }
    if (!res.ok || !body || body.success === false) throw new Error((body && body.message) || "HTTP " + res.status);
    return body.data;
  });
}
function apiPost(url, payload) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(async res => {
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.success === false) throw new Error((body && body.message) || "HTTP " + res.status);
      return body.data;
    });
}
const $ = id => document.getElementById(id);
function showLoading(on) { $("loadingBar").style.display = on ? "block" : "none"; }

/** 回车确认：输入框内按 Enter 触发对应按钮/回调 */
function bindEnter(inputId, btnId, handler) {
  const el = $(inputId);
  if (!el) return;
  el.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (btnId && $(btnId)) $(btnId).click();
      else if (handler) handler();
    }
  });
}
function showError(msg, hint) {
  const box = $("errorBox");
  if (!msg) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = "<b>⚠️ " + msg + "</b>" + (hint ? "<div class=hint>" + hint + "</div>" : "");
}

/* ==================== 主题 ==================== */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("btnTheme").textContent = theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem("wa-theme", theme);
  if (STATE.stats) renderAllCharts();
}
$("btnTheme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
});
applyTheme(localStorage.getItem("wa-theme") ||
  (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

/* ==================== 访问控制 ==================== */
function openAuth() {
  const mode = STATE.authMode;
  $("authTitle").textContent = "🔐 访问认证";
  $("authCode").placeholder = mode === "totp" ? "请输入 6 位验证码" : "请输入访问密码";
  $("authDesc").textContent = mode === "totp"
    ? "本系统启用了 APP 二次验证，请输入认证器 App 生成的 6 位验证码（验证通过后 2 天内免登录）。"
    : "本系统已启用访问密码保护，请输入密码后查看数据。";
  $("authModal").classList.add("show");
  setTimeout(() => $("authCode").focus(), 60);
}
$("authModeRow").addEventListener("click", e => {
  const btn = e.target.closest("[data-amode]");
  if (!btn) return;
  STATE.authMode = btn.dataset.amode;
  document.querySelectorAll("#authModeRow .chip").forEach(c => c.classList.toggle("active", c === btn));
  openAuth();
});
$("authConfirm").addEventListener("click", async () => {
  const code = $("authCode").value.trim();
  if (!code) return;
  showLoading(true);
  try {
    await apiPost("/api/auth", STATE.authMode === "totp" ? { code } : { password: code });
    $("authModal").classList.remove("show");
    $("authCode").value = "";
    STATE.needsAuth = false;
    await bootstrap();
  } catch (e) { $("authCode").value = ""; showError("认证失败：" + e.message); }
  finally { showLoading(false); }
});

/* ==================== 额度 ==================== */
async function loadUsage() {
  try {
    const u = await api("/api/usage");
    let html = "";
    if (u.workers && u.workers.configured) {
      const pct = u.workers.todayRequests / u.workers.requestsPerDay * 100;
      html += "<div class=quota-card><div class=q-label>⚡ Workers 请求</div><div class=q-row><span class=q-val>" + fmtCompact(u.workers.todayRequests) + "</span><span class=q-limit> / 每日 " + fmtCompact(u.workers.requestsPerDay) + "</span></div><div class='q-bar" + (pct > 80 ? " q-danger" : "") + "'><i style='width:" + Math.min(pct, 100).toFixed(1) + "%'></i></div></div>";
    }
    if (u.d1 && u.d1.configured) {
      const reads = u.d1.todayReadQueries || 0, writes = u.d1.todayWriteQueries || 0;
      html += "<div class=quota-card><div class=q-label>🗄️ D1 读查询</div><div class=q-row><span class=q-val>" + fmtCompact(reads) + "</span><span class=q-limit> 次查询（今日）</span></div><div class=q-bar><i style='width:100%'></i></div><div class=q-limit>免费档上限 500 万行读/日（行数不可见，展示查询次数）</div></div>";
      html += "<div class=quota-card><div class=q-label>✍️ D1 写查询</div><div class=q-row><span class=q-val>" + fmtCompact(writes) + "</span><span class=q-limit> 次查询（今日）</span></div><div class=q-bar><i style='width:100%'></i></div><div class=q-limit>免费档上限 10 万行写/日</div></div>";
    }
    if (html) {
      $("quotaCards").innerHTML = html;
      $("quotaNote").textContent = "免费档限额 · 更新于 " + new Date(u.fetchedAt).toLocaleTimeString("zh-CN", { hour12: false });
      $("quotaWrap").style.display = "block";
    }
  } catch (e) { /* 额度接口不可用时静默 */ }
}
$("btnUsage").addEventListener("click", () => { $("quotaWrap").style.display = $("quotaWrap").style.display === "block" && !$("quotaCards").innerHTML ? "block" : "none"; if ($("quotaWrap").style.display === "block") loadUsage(); });

/* ==================== 管理 ==================== */
let adminKey = sessionStorage.getItem("wa-admin-key") || "";
function adminHeaders() { return { "Content-Type": "application/json", "X-Admin-Key": adminKey }; }
function adminApi(url, payload, method) {
  return fetch(url, { method: method || (payload ? "POST" : "GET"), headers: adminHeaders(), body: payload ? JSON.stringify(payload) : undefined })
    .then(async res => { const b = await res.json().catch(() => null); if (!res.ok || !b || b.success === false) throw new Error((b && b.message) || "HTTP " + res.status); return b.data; });
}
$("btnAdmin").addEventListener("click", () => {
  $("adminKey").value = adminKey;
  $("adminModal").classList.add("show");
  setTimeout(() => $("adminKey").focus(), 60);
  if (adminKey) { loadAdminConfig(); renderAdminSites(); }
});
$("adminKey").addEventListener("input", e => { adminKey = e.target.value.trim(); sessionStorage.setItem("wa-admin-key", adminKey); });
$("accessMode").addEventListener("change", () => {
  const m = $("accessMode").value;
  $("pwArea").style.display = m === "password" ? "block" : "none";
  $("totpArea").style.display = m === "totp" ? "block" : "none";
});
async function loadAdminConfig() {
  try {
    const st = await adminApi("/api/config?action=status", null, "POST");
    $("accessMode").value = st.mode || "none";
    $("pwArea").style.display = st.mode === "password" ? "block" : "none";
    $("totpArea").style.display = st.mode === "totp" ? "block" : "none";
  } catch (e) { showError("读取访问配置失败：" + e.message); }
}
async function renderAdminSites() {
  try {
    const d = await api("/api/sites");
    const el = $("adminSiteList");
    el.innerHTML = d.sites.length === 0
      ? '<div class="hint">暂无网站，输入域名添加或点击「同步」从 Cloudflare 导入。</div>'
      : d.sites.map(s => "<div class=admin-site-item><span class=dom>🌐 " + s.name + "</span><span style='color:var(--text-dim);font-size:12px'>" + (s.zoneId ? s.zoneId.slice(0, 8) : "未解析") + "</span><button class=del data-domain='" + s.name + "' title=删除>✕</button></div>").join("");
    el.querySelectorAll(".del").forEach(b => b.addEventListener("click", () => delAdminSite(b.dataset.domain)));
  } catch (e) { showError("站点列表加载失败：" + e.message); }
}
async function delAdminSite(domain) {
  if (!confirm("确认删除网站 " + domain + " ？（将同时删除其统计快照）")) return;
  try {
    await adminApi("/api/sites?action=delete", { domain, action: "delete" }, "DELETE");
    await renderAdminSites();
    await loadSites();
  } catch (e) { showError("删除失败：" + e.message); }
}
$("btnAddSite").addEventListener("click", async () => {
  const domain = $("siteDomain").value.trim();
  if (!domain) return;
  try {
    await adminApi("/api/sites", { domain, action: "add" });
    $("siteDomain").value = "";
    await renderAdminSites();
    await loadSites();
  } catch (e) { showError("添加失败：" + e.message); }
});
$("btnSyncSites").addEventListener("click", async () => {
  try {
    const r = await adminApi("/api/sites?action=sync&sync=1", { action: "sync" });
    showError(""); alert("同步完成，导入 " + (r.imported || 0) + " 个站点，共 " + r.total + " 个。");
    await renderAdminSites();
    await loadSites();
  } catch (e) { showError("同步失败：" + e.message); }
});
$("btnSaveAccess").addEventListener("click", async () => {
  const mode = $("accessMode").value;
  try {
    if (mode === "password") {
      const pw = $("newPassword").value;
      if (pw.length < 4) { showError("密码至少 4 位"); return; }
      await adminApi("/api/config", { action: "password", password: pw });
      $("newPassword").value = "";
      alert("访问密码已设置并启用。");
    } else if (mode === "totp") {
      await adminApi("/api/config", { action: "mode", mode: "totp" });
      alert("已在「APP 二次验证」模式。请先在下方完成 TOTP 绑定，否则访问会被拒绝。");
    } else {
      await adminApi("/api/config", { action: "mode", mode: "none" });
      alert("已切换为公开访问。");
    }
    await loadAdminConfig();
  } catch (e) { showError("保存失败：" + e.message); }
});
$("btnAccessDisable").addEventListener("click", async () => {
  if (!confirm("关闭全部访问控制（公开可访问数据）？")) return;
  try { await adminApi("/api/config", { action: "disable" }); alert("访问控制已全部关闭。"); await loadAdminConfig(); }
  catch (e) { showError("操作失败：" + e.message); }
});
$("btnTotpNew").addEventListener("click", async () => {
  try {
    const r = await adminApi("/api/config", { action: "totp-new" });
    $("totpBindArea").style.display = "block";
    $("totpSecretText").textContent = "密钥：" + r.secret;
    const qr = $("totpQr");
    qr.innerHTML = "";
    if (window.QRCode) new QRCode(qr, { text: r.otpauthURL, width: 168, height: 168 });
    else qr.innerHTML = '<div class="qr-fallback">浏览器未加载二维码组件，请手动输入上方密钥至认证器 App。</div>';
  } catch (e) { showError("生成密钥失败：" + e.message); }
});
$("btnTotpVerify").addEventListener("click", async () => {
  const code = $("totpCode").value.trim();
  if (!/^\\d{6}$/.test(code)) { showError("请输入 6 位验证码"); return; }
  try {
    await adminApi("/api/config", { action: "totp-verify", code });
    $("totpBindArea").style.display = "none";
    $("totpCode").value = "";
    alert("APP 二次验证已启用。");
    await loadAdminConfig();
  } catch (e) { showError("验证失败：" + e.message); }
});
$("adminModal").addEventListener("click", e => { if (e.target === $("adminModal")) $("adminModal").classList.remove("show"); });

/* ==================== 站点与范围 ==================== */
function renderSiteSelect() {
  const sel = $("siteSelect");
  const total = STATE.sites.length;
  let html = "<option value=all>🌐 全部站点 (" + total + ")</option>";
  for (const s of STATE.sites) html += "<option value='" + s.name + "'>" + s.name + "</option>";
  sel.innerHTML = html;
  sel.value = STATE.site;
}
$("siteSelect").addEventListener("change", e => { STATE.site = e.target.value; loadStats(); });
$("rangeTabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  STATE.range = btn.dataset.range;
  document.querySelectorAll("#rangeTabs button").forEach(b => b.classList.toggle("active", b === btn));
  loadStats();
});

/* ==================== 数据加载 ==================== */
async function loadSites() {
  try {
    const data = await api("/api/sites");
    STATE.sites = data.sites || [];
    renderSiteSelect();
  } catch (e) {
    showError("站点列表加载失败：" + e.message, "请先在「管理」中添加网站（需 EXPORT_KEY），或在服务端配置后自动同步。");
    throw e;
  }
}
async function loadStats() {
  showLoading(true);
  showError("");
  try {
    const data = await api("/api/stats?site=" + encodeURIComponent(STATE.site) + "&range=" + STATE.range);
    STATE.stats = data;
    $("updatedAt").textContent = "数据更新于 " + fmtDateTime(data.generatedAt) + " · 范围：" + data.rangeLabel + " · 本地时区 " + LOCAL_TZ + " (" + tzOffset() + ")";
    renderAll();
    renderReport();
  } catch (e) {
    showError("统计数据加载失败：" + e.message, "常见原因：Token 无 Analytics 权限 / 配额受限 / 站点暂无数据（可到「管理」中添加网站）");
  } finally { showLoading(false); }
}
async function loadReport() {
  try {
    const d = await api("/api/report");
    STATE.report = d.report;
  } catch (_) { STATE.report = null; }
}

/* ==================== 渲染：KPI ==================== */
function renderKpis() {
  const t = STATE.stats.totals || {};
  const cards = [
    { label: "总请求 Requests", icon: "🚀", value: fmtCompact(t.requests), sub: fmtInt(t.requests) + " 次", color: "#f6821f" },
    { label: "页面浏览 PageViews", icon: "📄", value: fmtCompact(t.pageViews), sub: fmtInt(t.pageViews) + " 次", color: "#3b82f6" },
    { label: "独立访客 Uniques", icon: "👤", value: fmtCompact(t.uniques), sub: "按日去重求和", color: "#8b5cf6" },
    { label: "总流量 Bandwidth", icon: "📡", value: fmtBytes(t.bytes), sub: "边缘传输字节", color: "#06b6d4" },
    { label: "会话数 Visits", icon: "🔗", value: fmtCompact(t.visits), sub: "外部来源进入会话", color: "#10b981" },
    { label: "缓存命中率", icon: "⚡", value: fmtPct(t.cacheHitRate), sub: "命中 " + fmtCompact(t.cachedRequests) + " / " + fmtCompact(t.requests), color: "#84cc16" },
    { label: "威胁拦截 Threats", icon: "🛡️", value: fmtCompact(t.threats), sub: "HTTPS " + fmtPct(t.encryptedRate), color: "#ef4444" },
    { label: "WAF 拦截", icon: "🚧", value: fmtCompact(t.wafEvents), sub: "防火墙事件", color: "#f59e0b" },
  ];
  $("kpiGrid").innerHTML = cards.map(c =>
    "<div class=kpi-card style='--kc:" + c.color + "'><div class=kpi-label>" + c.icon + " " + c.label + "</div><div class=kpi-value style='color:" + c.color + "'>" + c.value + "</div><div class=kpi-sub>" + c.sub + "</div></div>").join("");
}

/* ==================== 渲染：图表 ==================== */
function chartTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return { text: dark ? "#8b97ab" : "#5d6b82", grid: dark ? "rgba(139,151,171,0.12)" : "rgba(93,107,130,0.15)", tooltipBg: dark ? "#1a2333" : "#ffffff" };
}
function destroyChart(key) { if (STATE.charts[key]) { STATE.charts[key].destroy(); delete STATE.charts[key]; } }
function baseOptions(extra) {
  const th = chartTheme();
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: th.text, boxWidth: 12, boxHeight: 12, font: { size: 12.5 } } },
      tooltip: { backgroundColor: th.tooltipBg, titleColor: th.text, bodyColor: th.text, borderColor: th.grid, borderWidth: 1, padding: 12, cornerRadius: 10 },
    },
  }, extra || {});
}
const TREND_METRICS = [
  { key: "requests", label: "请求数", color: "#f6821f" },
  { key: "pageViews", label: "浏览量", color: "#3b82f6" },
  { key: "uniques", label: "访客数", color: "#8b5cf6" },
  { key: "bytes", label: "流量", color: "#06b6d4" },
];
function renderTrendChips() {
  $("trendChips").innerHTML = TREND_METRICS.map(m =>
    "<button class='chip " + (STATE.trendMetrics.has(m.key) ? "active" : "") + "' data-metric='" + m.key + "' style='--cc:" + m.color + "'><span class=dot style='--cc:" + m.color + "'></span>" + m.label + "</button>").join("");
}
$("trendChips").addEventListener("click", e => {
  const chip = e.target.closest("button[data-metric]");
  if (!chip) return;
  const key = chip.dataset.metric;
  if (STATE.trendMetrics.has(key)) { if (STATE.trendMetrics.size === 1) return; STATE.trendMetrics.delete(key); }
  else STATE.trendMetrics.add(key);
  renderTrendChips();
  renderTrendChart();
});
function renderTrendChart() {
  destroyChart("trend");
  const stats = STATE.stats, trend = stats.trend || [];
  $("trendEmpty").style.display = trend.length ? "none" : "block";
  if (!trend.length) return;
  const isHour = stats.trendInterval === "hour";
  $("trendInterval").textContent = isHour ? "（今天 · 按小时 · 本地时区 " + LOCAL_TZ + "）" : "（" + stats.rangeLabel + " · 按日 UTC 口径）";
  const labels = trend.map(r => isHour ? fmtHour(r.datetime) : r.date.slice(5));
  const th = chartTheme();
  const datasets = TREND_METRICS.filter(m => STATE.trendMetrics.has(m.key)).map(m => ({
    label: m.label, data: trend.map(r => r[m.key] || 0),
    borderColor: m.color, backgroundColor: m.color + "22", fill: m.key === "requests",
    tension: 0.35, pointRadius: isHour ? 0 : 2.5, pointHoverRadius: 5, borderWidth: 2.2, yAxisID: "y",
  }));
  STATE.charts.trend = new Chart($("trendChart"), {
    type: "line", data: { labels, datasets },
    options: baseOptions({ scales: {
      x: { ticks: { color: th.text, maxTicksLimit: isHour ? 12 : 15, font: { size: 11.5 } }, grid: { color: th.grid } },
      y: { position: "left", beginAtZero: true, ticks: { color: th.text, font: { size: 11.5 }, callback: v => fmtCompact(v) }, grid: { color: th.grid } },
    } }),
  });
}
function renderDonut(key, canvasId, items, colors, zhFn) {
  destroyChart(key);
  const th = chartTheme();
  const labels = items.map(i => (zhFn ? zhFn(i.label) : i.label));
  STATE.charts[key] = new Chart($(canvasId), {
    type: "doughnut",
    data: { labels, datasets: [{ data: items.map(i => i.value), backgroundColor: colors, borderColor: "transparent", borderWidth: 2, hoverOffset: 6 }] },
    options: baseOptions({ cutout: "62%", plugins: {
      legend: { position: "bottom", labels: { color: th.text, boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 12.5 } } },
      tooltip: Object.assign(baseOptions().plugins.tooltip, { callbacks: { label: ctx => " " + ctx.label + ": " + fmtCompact(ctx.parsed) + " (" + fmtPct(ctx.parsed / items.reduce((s, i) => s + i.value, 0) || 1) + ")" } }),
    } }),
  });
}
function toggleChartEmpty(key, hasData) {
  $(key + "Chart").style.display = hasData ? "block" : "none";
  $(key + "Empty").style.display = hasData ? "none" : "block";
}
function renderDonuts() {
  const b = STATE.stats.breakdowns || {}, t = STATE.stats.totals || {};
  $("cacheHitText").textContent = fmtPct(t.cacheHitRate);
  const cacheItems = [{ label: "缓存命中", value: t.cachedRequests || 0 }, { label: "未命中", value: t.uncachedRequests || 0 }].filter(i => i.value > 0);
  toggleChartEmpty("cache", cacheItems.length > 0);
  if (cacheItems.length) renderDonut("cache", "cacheChart", cacheItems, ["#10b981", "#64748b"]);
  const devices = (b.devices || []).slice(0, 5);
  $("deviceNote").textContent = devices.length && b.devicesWindowDays ? "近 " + b.devicesWindowDays + " 天样本" : "";
  toggleChartEmpty("device", devices.length > 0);
  if (devices.length) renderDonut("device", "deviceChart", devices.map(d => ({ label: d.type, value: d.requests })), PALETTE.slice(1), v => DEVICE_ZH[v] || v);
  const statuses = (b.statuses || []).slice(0, 5);
  toggleChartEmpty("status", statuses.length > 0);
  if (statuses.length) {
    const top = statuses.map(s => ({ label: String(s.status), value: s.requests }));
    const others = (b.statuses || []).slice(5);
    if (others.length) top.push({ label: "其他", value: others.reduce((s, x) => s + x.requests, 0) });
    const statusColor = code => code.startsWith("2") ? "#10b981" : code.startsWith("3") ? "#3b82f6" : code.startsWith("4") ? "#f59e0b" : code.startsWith("5") ? "#ef4444" : "#64748b";
    renderDonut("status", "statusChart", top, top.map(i => statusColor(i.label)));
  }
}

/* ==================== 渲染：排行列表 ==================== */
function renderRankList(elId, items, opts) {
  const el = $(elId);
  if (!items || !items.length) { el.innerHTML = "<div class=empty-state style='padding:36px 10px'>暂无数据</div>"; return; }
  const max = Math.max(...items.map(i => i.value), 1);
  el.innerHTML = items.map((i, idx) =>
    "<div class=rank-item><div class=meta><span>" + (opts.icon ? opts.icon(i, idx) + " " : "") + opts.name(i) + (opts.sub ? " <span style='color:var(--text-dim);font-size:12px'>" + opts.sub(i) + "</span>" : "") + "</span><span class=val>" + opts.value(i) + (opts.pct ? " · " + fmtPct((i.value / opts.pct) * 100) : "") + "</span></div><div class=rank-bar-wrap><div class=rank-bar style='width:" + (i.value / max * 100).toFixed(1) + "%;opacity:" + (1 - idx * 0.06) + "'></div></div></div>").join("");
}
function renderBreakdowns() {
  const b = STATE.stats.breakdowns || {};
  const totalReq = (STATE.stats.totals || {}).requests || 0;
  const countries = (b.countries || []).slice(0, 5).map(c => ({ ...c, value: c.requests }));
  renderRankList("countryList", countries, { icon: c => countryFlag(c.code), name: c => countryName(c.code), sub: c => c.code, value: c => fmtInt(c.value), pct: totalReq });
  const ctypes = (b.contentTypes || []).slice(0, 5).map(c => ({ ...c, value: c.requests }));
  renderRankList("contentTypeList", ctypes, { name: c => c.name || "未知", value: c => fmtCompact(c.value), pct: totalReq });
  const browsers = (b.browsers || []).slice(0, 5).map(x => ({ ...x, value: x.pageViews }));
  renderRankList("browserList", browsers, { name: x => x.name || "未知", value: x => fmtCompact(x.value), pct: (STATE.stats.totals || {}).pageViews || 0 });

  const ipClasses = (b.ipClasses || []).slice(0, 5).map(x => ({ ...x, value: x.requests }));
  renderRankList("ipClassList", ipClasses, { icon: x => IPCLASS_ICON[x.name] || "📦", name: x => IPCLASS_ZH[x.name] || x.name, value: x => fmtCompact(x.value), pct: totalReq });
  const ssls = (b.sslProtocols || []).slice(0, 5).map(x => ({ ...x, value: x.requests }));
  renderRankList("sslList", ssls, { name: x => SSL_ZH[x.name] || x.name, value: x => fmtCompact(x.value), pct: totalReq });
  const threats = (b.threatPathing || []).slice(0, 5).map(x => ({ ...x, value: x.requests }));
  renderRankList("threatList", threats, { icon: x => THREAT_ICON[x.name] || "⚠️", name: x => x.name, value: x => fmtCompact(x.value), pct: totalReq });
  const wafs = (b.wafActions || []).slice(0, 5).map(x => ({ ...x, value: x.requests }));
  renderRankList("wafList", wafs, { name: x => WAF_ZH[x.name] || x.name, value: x => fmtCompact(x.value) });
}

/* ==================== 渲染：站点对比 ==================== */
function renderCompare() {
  const perSite = STATE.stats.perSite || [];
  const multi = perSite.length > 1;
  $("compareCard").style.display = multi ? "block" : "none";
  if (!multi) return;
  $("compareNote").textContent = STATE.stats.rangeLabel + " · 共 " + perSite.length + " 个站点";
  const maxReq = Math.max(...perSite.map(s => s.totals.requests), 1);
  const rows = perSite.slice().sort((a, b) => b.totals.requests - a.totals.requests).map(s => {
    const t = s.totals;
    const badge = t.requests / maxReq > 0.6 ? '<span class="badge b-success">领先</span>'
      : t.requests / maxReq > 0.2 ? '<span class="badge b-info">平稳</span>' : '<span class="badge b-warning">待提升</span>';
    return "<tr><td><b>" + s.name + "</b> " + badge + "</td><td>" + fmtInt(t.requests) + "</td><td>" + fmtInt(t.pageViews) + "</td><td>" + fmtInt(t.uniques) + "</td><td>" + fmtBytes(t.bytes) + "</td><td>" + fmtPct(t.cacheHitRate) + "</td><td>" + fmtInt(t.visits) + "</td><td>" + fmtInt(t.wafEvents) + "</td></tr>";
  }).join("");
  $("compareTable").innerHTML = "<thead><tr><th>站点</th><th>请求数</th><th>浏览量</th><th>独立访客</th><th>流量</th><th>缓存命中</th><th>会话</th><th>WAF</th></tr></thead><tbody>" + rows + "</tbody>";
}

/* ==================== 渲染：热门站点排行 ==================== */
const RANK_METRICS = [
  { key: "requests", label: "请求", color: "#f6821f", fmt: fmtCompact },
  { key: "pageViews", label: "浏览", color: "#3b82f6", fmt: fmtCompact },
  { key: "uniques", label: "访客", color: "#8b5cf6", fmt: fmtCompact },
  { key: "bytes", label: "流量", color: "#06b6d4", fmt: fmtBytes },
  { key: "visits", label: "会话", color: "#10b981", fmt: fmtCompact },
];

function renderRankChips() {
  $("rankChips").innerHTML = RANK_METRICS.map(m =>
    "<button class='chip " + (STATE.rankMetric === m.key ? "active" : "") + "' data-rank='" + m.key + "' style='--cc:" + m.color + "'><span class=dot style='--cc:" + m.color + "'></span>" + m.label + "</button>").join("");
}

$("rankChips").addEventListener("click", e => {
  const chip = e.target.closest("button[data-rank]");
  if (!chip) return;
  STATE.rankMetric = chip.dataset.rank;
  renderRankChips();
  renderSiteRanking();
});

function renderSiteRanking() {
  const perSite = (STATE.stats && STATE.stats.perSite) || [];
  const card = $("siteRankCard");
  if (perSite.length < 2) { card.style.display = "none"; return; }
  card.style.display = "block";
  const m = RANK_METRICS.find(x => x.key === STATE.rankMetric) || RANK_METRICS[0];
  const items = perSite.map(s => ({ ...s, value: s.totals[m.key] || 0 })).sort((a, b) => b.value - a.value);
  const max = Math.max(...items.map(i => i.value), 1);
  const medal = i => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "<span class=rank-no>" + (i + 1) + "</span>";
  $("siteRankList").innerHTML = items.map((s, i) =>
    "<div class=rank-item><div class=meta><span><span class=medal>" + medal(i) + "</span> <b style='font-size:13.5px'>" + escapeHtml(s.name) + "</b></span><span class=val>" + m.fmt(s.value) + "</span></div><div class=rank-bar-wrap><div class=rank-bar style='width:" + (s.value / max * 100).toFixed(1) + "%'></div></div></div>").join("");
}

/* ==================== 渲染：热门页面 ==================== */
function renderTopPages() {
  const b = (STATE.stats && STATE.stats.breakdowns) || {};
  const pages = (b.topPages || []).slice(0, 5);
  $("topPagesNote").textContent = pages.length && b.topPagesWindowDays ? "近 " + b.topPagesWindowDays + " 天采样 · 按请求数" : "Adaptive 采样";
  const items = pages.map(p => ({ ...p, value: p.requests }));
  renderRankList("topPagesList", items, {
    name: p => "<span class='path-name'>" + escapeHtml(!p.path || p.path === "/" ? "/（首页）" : p.path) + "</span>",
    value: p => fmtCompact(p.value),
    sub: p => fmtBytes(p.bytes || 0),
  });
}

/* ==================== 渲染：AI 分析报告 ==================== */
const GRADE_BADGE = { "优秀": "b-success", "良好": "b-success", "一般": "b-warning", "较差": "b-danger" };
const REC_ICON = { success: "✅", warning: "⚠️", info: "💡" };
function renderSiteAnalysis(site) {
  const a = site.analysis || {};
  return "<div class=report-summary><b>" + site.name + "</b><span class='badge " + (GRADE_BADGE[a.grade] || "b-info") + " report-grade'>" + (a.grade || "未评级") + "</span><br>" + (a.summary || "暂无总结") + "</div>"
    + (a.keyFindings && a.keyFindings.length ? "<div class=findings>" + a.keyFindings.map(f => "<div class=finding><span>" + (f.icon || "•") + "</span><span>" + f.text + "</span></div>").join("") + "</div>" : "")
    + (a.recommendations && a.recommendations.length ? "<div class=rec-grid>" + a.recommendations.map(r => "<div class='rec-card rec-" + (r.type || "info") + "'><div class=rec-title>" + (REC_ICON[r.type] || "💡") + " " + (r.title || "") + "<span class='badge b-info' style=margin-left:auto>" + (({ high: "高优先级", medium: "中优先级", low: "低优先级" })[r.priority] || "") + "</span></div><div class=rec-detail>" + (r.detail || "") + "</div></div>").join("") + "</div>" : "")
    + (a.deepAnalysis ? "<div class=deep-grid>"
      + (a.deepAnalysis.trafficPattern ? "<div class=deep-item><h4>🔄 流量规律</h4><p>" + a.deepAnalysis.trafficPattern + "</p></div>" : "")
      + (a.deepAnalysis.userBehavior ? "<div class=deep-item><h4>👤 用户行为</h4><p>" + a.deepAnalysis.userBehavior + "</p></div>" : "")
      + (a.deepAnalysis.growthDrivers ? "<div class=deep-item><h4>🚀 增长驱动</h4><p>" + a.deepAnalysis.growthDrivers + "</p></div>" : "")
      + (a.deepAnalysis.riskPoints && a.deepAnalysis.riskPoints.length ? "<div class=deep-item><h4>⚠️ 风险点</h4><ul>" + a.deepAnalysis.riskPoints.map(r => "<li>" + r + "</li>").join("") + "</ul></div>" : "")
      + (a.deepAnalysis.actionPlan && a.deepAnalysis.actionPlan.length ? "<div class=deep-item><h4>📋 行动计划</h4><ul>" + a.deepAnalysis.actionPlan.map(r => "<li>" + r + "</li>").join("") + "</ul></div>" : "")
      + "</div>" : "")
    + (a.trendOutlook ? "<div class=outlook>🔮 <b>趋势展望：</b>" + a.trendOutlook + "</div>" : "");
}
function renderOverallAnalysis(o) {
  return "<div class=report-summary>" + (o.summary || "暂无总结") + "</div>"
    + (o.siteRanking && o.siteRanking.length ? "<div class=site-chip-row>" + o.siteRanking.map((s, i) => "<span class=chip style='--cc:" + PALETTE[i % PALETTE.length] + ";color:var(--text)'><span class=dot style='--cc:" + PALETTE[i % PALETTE.length] + "'></span>" + s.name + " · " + (s.note || "") + "</span>").join("") + "</div>" : "")
    + (o.strategicRecommendations && o.strategicRecommendations.length ? "<div class=rec-grid>" + o.strategicRecommendations.map(r => "<div class='rec-card rec-info'><div class=rec-title>🎯 " + (r.target || "") + " · " + (r.strategy || "") + "</div><div class=rec-detail><b style=color:var(--text)>重点：</b>" + (r.focus || "") + "</div>" + (r.actions && r.actions.length ? "<ul style='padding-left:18px;margin-top:8px;display:flex;flex-direction:column;gap:3px'>" + r.actions.map(a => "<li style='font-size:13.5px;color:var(--text-dim)'>" + a + "</li>").join("") + "</ul>" : "") + "</div>").join("") + "</div>" : "");
}
function renderReport() {
  const report = STATE.report;
  const meta = $("reportMeta"), body = $("reportBody");
  if (!report || !report.version) {
    meta.textContent = "";
    body.innerHTML = "<div class=report-missing>暂无分析报告。<br>可由外部程序调用 <code>/api/export</code> 获取原始数据 → 自行分析 → POST <code>/api/report</code>（schema v3.0，EXPORT_KEY 鉴权）</div>";
    return;
  }
  const rangeText = report.range ? (report.range.start || "?") + " ~ " + (report.range.end || "?") : "";
  meta.textContent = "schema v" + report.version + " · " + (report.generator || "外部分析程序") + " · " + rangeText + " · 生成于 " + fmtDateTime(report.generatedAt) + " · " + LOCAL_TZ;
  if (STATE.site !== "all" && report.sites) {
    const site = report.sites.find(s => s.name === STATE.site);
    body.innerHTML = site ? renderSiteAnalysis(site) : "<div class=report-missing>报告中暂无站点 <b>" + STATE.site + "</b> 的分析，请查看总览报告或重新生成</div>";
    return;
  }
  let html = "";
  if (report.overall) html += renderOverallAnalysis(report.overall);
  if (report.sites && report.sites.length) html += report.sites.map(site => renderSiteAnalysis(site)).join("");
  body.innerHTML = html || '<div class="report-missing">报告数据为空</div>';
}

/* ==================== 导出弹窗 ==================== */
let exportFormat = "json";
$("btnExport").addEventListener("click", () => {
  $("exportSite").value = STATE.site === "all" ? "全部站点（" + STATE.sites.length + " 个）" : STATE.site;
  $("exportModal").classList.add("show");
  $("exportKey").value = "";
  setTimeout(() => $("exportKey").focus(), 60);
});
$("exportCancel").addEventListener("click", () => $("exportModal").classList.remove("show"));
$("exportModal").addEventListener("click", e => { if (e.target === $("exportModal")) $("exportModal").classList.remove("show"); });
document.querySelectorAll(".modal .format-row .chip[data-format]").forEach(chip => {
  chip.addEventListener("click", () => {
    exportFormat = chip.dataset.format;
    document.querySelectorAll(".chip[data-format]").forEach(c => c.classList.toggle("active", c === chip));
  });
});
$("exportConfirm").addEventListener("click", () => {
  const key = $("exportKey").value.trim();
  const url = "/api/export?format=" + exportFormat + "&site=" + encodeURIComponent(STATE.site) + "&days=30" + (key ? "&key=" + encodeURIComponent(key) : "");
  window.open(url, "_blank");
  $("exportModal").classList.remove("show");
});

/* ==================== 总渲染 ==================== */
function renderAllCharts() { renderTrendChart(); renderDonuts(); }
function renderAll() { renderKpis(); renderTrendChips(); renderRankChips(); renderAllCharts(); renderBreakdowns(); renderCompare(); renderSiteRanking(); renderTopPages(); }

/* ==================== 回车确认绑定 ==================== */
bindEnter("authCode", "authConfirm");
bindEnter("exportKey", "exportConfirm");
bindEnter("siteDomain", "btnAddSite");
bindEnter("totpCode", "btnTotpVerify");
bindEnter("newPassword", "btnSaveAccess");
bindEnter("adminKey", null, () => { if (adminKey) { loadAdminConfig(); renderAdminSites(); } });

/* ==================== 初始化 ==================== */
async function bootstrap() {
  await Promise.all([loadSites(), loadReport(), loadUsage()]);
  if (!STATE.needsAuth) await loadStats();
}
(async function init() {
  (function () {
    const el = document.getElementById("footTz");
    if (el) el.textContent = LOCAL_TZ + " (" + tzOffset() + ")";
  })();
  try {
    const cfg = await api("/api/config");
    STATE.needsAuth = cfg.needsAuth;
    if (STATE.needsAuth) openAuth();
    else await bootstrap();
  } catch (e) {
    showError("初始化失败：" + e.message);
  }
})();
</script>
</body>
</html>
`;
# Cloudflare 网站流量分析 · AI 报告系统

> **本文件为 `dev` 分支**（Cloudflare Workers + D1 版）。
> `main` 分支（Netlify/Vercel 无数据库版）的说明见各分支自身 README。

## 🧭 dev 分支概览（Workers + D1）

- **部署平台**：Cloudflare Workers + D1（不再需要 Netlify/Vercel，不依赖 MongoDB）
- **数据存储**：D1 保存 全局设置 / 站点管理 / AI 报告 / **每日数据快照**（Cron 每日 00:05 UTC 回填近 30 天）
- **数据展示**：今日=实时 GraphQL；近7天/近30天=D1 快照优先，缺失日期自动回源补齐
- **指标**：UV / PV / 总流量 / 总请求数 / 带宽 + 会话数 Visits + WAF 拦截 + 流量来源分类(ipClass) + TLS 版本 + 威胁细分
- **请求额度**：顶栏「额度」展示 Workers 请求（免费档 10 万/日）与 D1 读/写查询次数（免费档行数上限 读500万/写10万/日仅供说明）
- **全局访问控制**：默认公开；可配置「访问密码」或「APP 二次验证（TOTP）」，管理操作以 `EXPORT_KEY` 鉴权
- **AI 分析**：流程与 main 一致 —— 外部程序 `GET /api/export`（EXPORT_KEY）→ 分析 → `POST /api/report`（schema v3.0）
- **CI**：`.github/workflows/deploy-dev.yml`，仅需 secrets：`CLOUDFLARE_API_TOKEN`、`EXPORT_KEY`

> ℹ️ **WAF 拦截**依赖 Token 具备 Firewall 相关 Analytics 权限，当前测试 Token 仅「Analytics Read」时该指标显示 0/暂无数据（接口静默降级，不影响其他功能）。

```bash
# 本地开发（需 .dev.vars：CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / EXPORT_KEY）
npm install
npm run dev              # http://localhost:8787（wrangler dev --local，D1 本地模拟、GraphQL 真实调用）

# 部署
wrangler d1 create website-analytics-dev-db   # 首次建库（需要 D1 Edit 权限；或将 yarn 输出 database_id 填入 wrangler.jsonc）
wrangler d1 execute website-analytics-dev-db --remote --file=src/schema.sql
npx wrangler deploy --var CLOUDFLARE_API_TOKEN:$env:CLOUDFLARE_API_TOKEN --var EXPORT_KEY:$env:EXPORT_KEY
# 推送 dev 分支即可由 GitHub Actions 自动部署
```

> 目前环境 Node 较旧（16）时请使用 Node 18+ 运行 wrangler（本项目附带 .tools/ 便携版说明见下）。

---

## 📦 原 main 分支文档（Netlify/Vercel 版）

基于 **Cloudflare GraphQL Analytics API** 的多站点流量分析平台。服务端持有 API Token 实时代理查询，访客**无需登录 Cloudflare** 即可查看；支持多站点总览、今天/近7天/近30天多维度查看、近 30 天原始数据导出（带密码），以及外部程序生成 `report.json` 驱动的 AI 分析报告。

> 前一版本（51.LA 数据源 + MongoDB 采集）已归档于 `V1.0.0` 分支/标签。

## 🏗️ 架构概览

```
                 ┌──────────────────────────────┐
                 │   Cloudflare                 │
                 │  · GraphQL Analytics API     │◄──────┐
                 │  · REST /zones（站点列表）   │───────┤ Bearer Token
                 └──────────────────────────────┘       │ (仅存于服务端)
                                                        │
┌──────────────┐   ┌──────────────────────────────────────────────┐
│ 访客浏览器    │──►│  Serverless 函数（Netlify / Vercel）          │
│  · 多站点切换 │   │  GET /api/sites   站点(zone)列表             │
│  · 今天/7/30天│   │  GET /api/stats   实时聚合统计（KPI/趋势/维度）│
│  · 多维图表   │   │  GET /api/export  近30天原始数据导出(带密码)  │
│  · AI 报告    │──►│  静态文件 public/data/report.json（AI 分析）  │
└──────────────┘   └──────────────────────────────────────────────┘
                                                        ▲
                              ┌─────────────────────────┴─────────┐
                              │ 外部分析程序（任意语言/任意宿主）   │
                              │ 1. 调 /api/export 取原始数据       │
                              │ 2. 自行分析（AI/规则均可）          │
                              │ 3. 按 schema v3.0 生成 report.json │
                              │ 4. 部署/提交到 public/data/        │
                              └───────────────────────────────────┘
```

**设计要点**

- **无数据库**：Cloudflare GraphQL 支持直接查询历史数据（Adaptive 数据集全套餐至少保留 31 天），按需实时聚合，不再需要 MongoDB 与定时采集。
- **速率友好**：Token 限额 300 次 GraphQL 查询/5 分钟；`/api/stats` 与 `/api/sites` 响应带 `Cache-Control`（默认 300s），多访客场景由 CDN 缓存削峰；单次 GraphQL 查询可批量最多 10 个 zone（`zoneTag_in`）。
- **日期口径**：与 Cloudflare 控制台一致，使用 **UTC 日期**（「今天」为 UTC 当天，含未结束的部分数据）。

## ✨ 功能特性

- 🏢 **多站点支持** — 自动发现 Token 可访问的全部 zone，或用 `CF_ZONES` 白名单显式指定；支持「全部站点」总览 + 单站点视图，多站点时展示对比表
- 📅 **多时间维度** — 今天（按小时趋势）/ 近7天 / 近30天（按日趋势）
- 📊 **多维分析** — KPI（请求/PV/独立访客/流量/缓存命中率/威胁拦截）、趋势图（指标可切换）、缓存状态、设备类型、状态码分布、国家/地区 Top10、内容类型、浏览器分布
- 🤖 **AI 分析报告** — 前端读取 `public/data/report.json` 渲染（schema v3.0 契约见下文），由外部程序生成，支持总览与单站点分析
- 📤 **原始数据导出** — `/api/export` 导出近 30 天 GraphQL API 原始返回（JSON 完整明细 / CSV 每日汇总），支持 `EXPORT_KEY` 密码保护防滥用
- 🌙 **明暗主题** — 跟随系统 + 手动切换，本地记忆

## 🚀 快速开始

### 1. 创建 Cloudflare API Token

> 📖 详细图文步骤、命令行验证方法与常见报错对照，见 [TOKEN.md](file:///c:/Users/A/Desktop/projects/website-analytics/server/TOKEN.md)（Token 配置指南）

1. 打开 [Cloudflare API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens) → **Create Token** → **Custom token**
2. 权限配置（二选一）：
   - **方案 A（推荐）**：`Zone → Analytics → Read` + `Zone → Zone → Read`，Zone Resources 选择 `All zones`（或指定站点）——自动发现站点
   - **方案 B（最小权限）**：仅 `Zone → Analytics → Read`——需另配 `CF_ZONES` 环境变量显式列出站点域名
3. 创建并复制 Token，配置为环境变量 `CLOUDFLARE_API_TOKEN`

### 2. 配置环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|:----:|------|--------|
| `CLOUDFLARE_API_TOKEN` | ✅ | Cloudflare API Token（也接受 `CF_API_TOKEN`） | - |
| `CLOUDFLARE_ACCOUNT_ID` | ❌ | 限定账号 ID（自动发现站点时过滤） | （不过滤） |
| `CF_ZONES` | ❌ | 站点白名单：`"a.com,b.com"` 或 `'["a.com","b.com"]'`，设置后无需 Zone Read 权限 | （全部 zone） |
| `EXPORT_KEY` | ❌ | 导出接口访问密码，未设置则不启用密码保护 | （空） |

### 3. 本地开发

```bash
cd server
npm run dev
# 打开 http://localhost:3001（Mock 数据，无需 Token）
```

### 4. 部署到 Netlify / Vercel

- **Netlify**：Build command 留空，Publish directory `public`，Functions directory `api`，配置环境变量
- **Vercel**：导入仓库，Root Directory `server`，Framework Preset `Other`，配置环境变量

零 npm 依赖，无需构建。

## 📡 API 文档

所有接口返回 `{ success, data }` 或 `{ success: false, message }`，基础路径 `/api`。

### 1. 站点列表 `GET /api/sites`

```json
{
  "success": true,
  "data": {
    "total": 2,
    "sites": [{ "name": "example.com", "zoneId": "xxx", "status": "active", "plan": "Free" }]
  }
}
```

### 2. 统计数据 `GET /api/stats?site=<域名|zoneId|all>&range=today|7d|30d`

| 参数 | 说明 |
|------|------|
| `site` | 站点域名或 zoneId，留空/`all` 为全部站点总览 |
| `range` | `today`（按小时趋势）/ `7d`（默认）/ `30d`（按日趋势） |

**响应结构：**

```jsonc
{
  "range": "7d", "rangeLabel": "近7天", "rangeDays": 7,
  "start": "2026-10-12", "end": "2026-10-18",     // UTC 日期
  "trendInterval": "day",                          // day | hour（today 时为 hour）
  "generatedAt": "2026-10-18T04:00:00.000Z",
  "sites": [{ "name": "example.com", "zoneId": "xxx" }],
  "totals": {                                      // 范围内 KPI 总量
    "requests": 0, "pageViews": 0, "uniques": 0,   // uniques 为「按日去重求和」口径
    "bytes": 0, "threats": 0,
    "cachedRequests": 0, "cachedBytes": 0,
    "uncachedRequests": 0, "uncachedBytes": 0,
    "encryptedRequests": 0, "encryptedBytes": 0,
    "cacheHitRate": 88.4, "encryptedRate": 97.2    // 百分数
  },
  "trend": [                                       // day: {date} / hour: {datetime}
    { "date": "2026-10-12", "requests": 0, "pageViews": 0, "uniques": 0, "bytes": 0, "threats": 0 }
  ],
  "breakdowns": {
    "countries":  [{ "code": "CN", "requests": 0, "bytes": 0, "threats": 0 }],
    "statuses":   [{ "status": 200, "requests": 0 }],
    "contentTypes": [{ "name": "html", "requests": 0, "bytes": 0 }],
    "browsers":   [{ "name": "Chrome", "pageViews": 0 }],
    "devices":    [{ "type": "mobile", "requests": 0 }],
    "devicesWindowDays": 3                          // 设备类型为 Adaptive 采样，窗口 min(范围, 3天)
  },
  "perSite": [                                     // 每站点明细（多站点对比用）
    { "name": "example.com", "zoneId": "xxx", "totals": { "..." : 0 }, "trend": [ /* 同上 */ ] }
  ]
}
```

**数据来源（GraphQL 数据集）：** `httpRequests1dGroups`（按日，含 countryMap/responseStatusMap/contentTypeMap/browserMap/uniq.uniques）、`httpRequests1hGroups`（今天按小时）、`httpRequestsAdaptiveGroups`（设备类型，独立查询、失败自动降级为空）。

### 3. 原始数据导出 `GET /api/export`

| 参数 | 说明 |
|------|------|
| `key` | 访问密码（配置了 `EXPORT_KEY` 时必填，错误返回 403） |
| `site` | 站点域名或 zoneId，留空导出全部 |
| `days` | 天数，默认 `30`，上限 `92` |
| `start` / `end` | 可选，覆盖日期范围（`YYYY-MM-DD`，UTC） |
| `format` | `json`（默认，完整明细）/ `csv`（每日汇总） |

**JSON 结构**（GraphQL 原始返回，未加工）：

```jsonc
{
  "exportedAt": "...",
  "source": "Cloudflare GraphQL Analytics API",
  "queryInfo": {
    "dataset": "httpRequests1dGroups",
    "date_geq": "2026-09-19", "date_leq": "2026-10-18", "dateBasis": "UTC",
    "fields": ["requests", "pageViews", "bytes", "threats", "cachedBytes", "cachedRequests",
               "encryptedBytes", "encryptedRequests", "countryMap", "responseStatusMap",
               "contentTypeMap", "browserMap", "uniq.uniques"]
  },
  "totalSites": 2,
  "totalRecords": 60,
  "sites": [
    {
      "site": "example.com",
      "zoneId": "xxx",
      "datasets": {
        "httpRequests1dGroups": [ /* GraphQL 原始返回的每日分组，含全部嵌套 Map */ ],
        "httpRequestsAdaptiveGroups_deviceTypes": [ /* 设备类型分布 */ ]
      }
    }
  ]
}
```

**CSV 列：** `site, date, requests, pageViews, uniques, bytes, cachedRequests, cachedBytes, uncachedRequests, threats, encryptedRequests`

## 📋 report.json 字段契约（schema v3.0）

前端读取 `public/data/report.json`（同源静态文件）渲染 AI 分析报告；文件不存在或格式错误时展示友好占位。**外部程序按以下契约生成**（示例见 `public/data/report.json`）：

```jsonc
{
  "version": "3.0",                      // 必填，固定 "3.0"
  "generatedAt": "ISO8601 时间",          // 必填
  "generator": "外部分析程序名称",          // 必填，展示在报告元信息
  "dataSource": "数据来源说明",            // 可选
  "range": { "days": 30, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },  // 可选，报告覆盖范围

  "sites": [                             // 每站点分析（单站点视图/总览视图均会渲染）
    {
      "name": "example.com",             // 必填，需与 /api/sites 返回的域名一致
      "metrics": {                       // 可选，与 /api/stats 口径一致的指标摘要
        "requests": 0, "pageViews": 0, "uniques": 0, "bytes": 0, "threats": 0, "cacheHitRate": 0
      },
      "analysis": {
        "grade": "优秀|良好|一般|较差",     // 可选，渲染为评级徽章
        "summary": "一段话总结",           // 必填
        "keyFindings": [ { "icon": "📈", "text": "关键发现（icon 为 emoji）" } ],
        "recommendations": [ { "type": "success|warning|info", "title": "标题",
                               "detail": "详情", "priority": "high|medium|low" } ],
        "deepAnalysis": {
          "trafficPattern": "流量规律", "userBehavior": "用户行为", "growthDrivers": "增长驱动",
          "riskPoints": ["风险点"], "actionPlan": ["行动计划"]
        },
        "trendOutlook": "趋势展望"
      }
    }
  ],

  "overall": {                           // 总览视图渲染（可选）
    "summary": "多站点总览总结",
    "siteRanking": [ { "name": "example.com", "note": "排名说明" } ],
    "strategicRecommendations": [ { "target": "站点名", "strategy": "策略名",
                                    "focus": "重点", "actions": ["具体动作"] } ]
  }
}
```

所有数组字段均可省略；未知字段会被忽略，便于增量扩展。

## 🔄 与外部分析程序集成

```bash
# 1. 获取近 30 天原始数据
curl "https://your-site.example.com/api/export?key=密码&days=30&format=json" -o raw.json

# 2. 外部程序分析 raw.json（规则引擎 / LLM 均可）

# 3. 按 schema v3.0 生成 report.json，部署到 public/data/report.json
#    （典型做法：CI 任务生成后提交仓库，与 V1.0.0 版本的「更新网站分析报告」提交模式一致）
```

## ⚙️ 限额与注意事项

| 项 | 值 |
|----|----|
| GraphQL 查询频率 | 每 Token 300 次 / 5 分钟（本站 `stats` 响应默认 CDN 缓存 300s 削峰） |
| 单查询 zone 数 | 最多 10 个（服务端自动分批） |
| 数据保留 | Adaptive 数据集全套餐 ≥ 31 天；按日/小时聚合数据集按套餐更长，近 30 天查询与导出均安全 |
| 设备类型 | `httpRequestsAdaptiveGroups` 为 Adaptive 采样数据，前端标注「近 3 天样本」 |
| 日期口径 | UTC（与 Cloudflare 控制台一致），「今天」含未结束的部分数据 |

## 📁 项目结构

```
server/
├── api/
│   ├── _utils/
│   │   ├── handler.js       # Netlify / Vercel 双平台兼容层
│   │   ├── cloudflare.js    # Cloudflare 数据层：GraphQL 客户端/查询/聚合（核心）
│   │   ├── response.js      # 统一响应 / CORS / Query 解析
│   │   ├── csv.js           # CSV 导出
│   │   └── config.js        # 环境变量配置
│   ├── sites.js             # GET /api/sites   站点列表
│   ├── stats.js             # GET /api/stats   统计聚合
│   └── export.js            # GET /api/export  原始数据导出（带密码）
├── public/
│   ├── index.html           # 前端单页（Chart.js）
│   ├── data/report.json     # AI 分析报告（外部程序生成，schema v3.0）
│   └── favicon.png
├── test-server.js           # 本地 Mock 服务器（npm run dev）
├── vercel.json / netlify.toml
└── package.json             # 零运行时依赖，Node >= 18
```

## 🔐 安全建议

1. **Token 最小授权** — 仅授予 Analytics 读取；配合 `CF_ZONES` 白名单可不需要 Zone Read 权限
2. **设置导出密码** — 生产环境务必配置 `EXPORT_KEY` 保护 `/api/export`
3. **Token 仅存服务端** — 全部 Cloudflare 调用发生在 Serverless 函数内，前端无法接触 Token
4. **定期轮换** Token 与导出密码

## 📜 License

MIT

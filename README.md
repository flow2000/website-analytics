# 51.LA 流量趋势分析 · AI 报告系统

基于 51.la 数据的多站点流量趋势分析平台，支持 AI 智能分析报告、动态数据展示、7/30天数据切换。

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                   GitHub Actions                         │
│  ┌─────────────────┐     ┌──────────────────────────┐  │
│  │ 定时/手动触发    │────▶│ scripts/collect-data.js  │  │
│  └─────────────────┘     └────────────┬─────────────┘  │
│                                        │                 │
│                                   调用 51.la API        │
└────────────────────────────────────────┼─────────────────┘
                                         │
                                         ▼
                              ┌────────────────────┐
                              │     MongoDB        │
                              │  (数据持久化存储)  │
                              └─────────┬──────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
          GET /api/sites     GET /api/stats     GET /api/analysis
          GET /api/export                                        │
                    │                   │                   │
                    ▼                   ▼                   ▼
              ┌─────────────────────────────────────────────────┐
              │              前端网站 (静态部署)                 │
              │  · 多站点总览/单站点切换                          │
              │  · 7天/30天数据切换                              │
              │  · 流量趋势图表                                  │
              │  · 质量指标评级                                  │
              │  · AI 智能分析报告                               │
              │  · 多站点对比表                                  │
              └─────────────────────────────────────────────────┘
                                        │
                                        ▼
                              外部 AI 系统消费
                        （调用 /api/analysis 或 /api/export）
```

## ✨ 功能特性

### 数据采集
- 🔄 **每日自动采集** - GitHub Actions 定时触发，每天访问一次 51.la API
- 💾 **原始数据存储** - 51.la 返回的完整 bean 数据原样保存到 MongoDB
- 🏢 **多站点支持** - 同一账号下可配置多个站点，独立存储

### 数据展示
- 📊 **总览仪表盘** - 多站点数据汇总展示
- 📈 **流量趋势图** - UV/PV/SV 趋势可视化，支持单指标/双指标切换
- 🎯 **流量质量指标** - 跳出率、访问时长、人均页数评级
- 🏆 **多站点对比表** - 横向对比各站点表现
- 📅 **7/30天切换** - 支持最近 7 天和最近 30 天数据查看
- 🌙/☀️ **明暗主题** - 支持深色/浅色模式切换

### AI 分析报告
- 🤖 **AI 智能分析** - 基于规则生成的模拟 AI 分析（可替换为真实 AI）
- 💡 **优化建议** - 按类型和优先级分类的改进建议
- 🔍 **深度分析** - 流量规律、用户行为、增长驱动、风险点
- 🔮 **趋势展望** - 未来趋势预测
- 📋 **行动计划** - 分阶段的落地执行方案
- 🎯 **战略建议** - 总览层面的多站点战略规划

### API 接口
- 🔌 **RESTful API** - 4 个核心接口，支持前端和外部系统调用
- 🔐 **访问控制** - 导出接口支持密码验证
- 📤 **多格式导出** - 支持 JSON 和 CSV 格式导出
- 📄 **分析 JSON 导出** - 提供结构化分析数据，供外部 AI 系统使用

## 📁 项目结构

```
server/
├── .github/
│   └── workflows/
│       └── collect-51la.yml         # GitHub Actions 采集工作流
├── api/
│   ├── _utils/
│   │   ├── handler.js                # Netlify/Vercel 兼容层
│   │   ├── mongo.js                  # MongoDB 连接与查询工具
│   │   ├── analyzer.js               # 数据分析器（统计+AI报告生成）
│   │   ├── response.js               # 响应工具（统一格式/CORS/Query解析）
│   │   ├── csv.js                    # CSV 导出工具
│   │   └── config.js                 # 共享配置（环境变量统一管理）
│   ├── sites.js                      # 获取站点列表 API
│   ├── stats.js                      # 获取统计数据 API
│   ├── analysis.js                   # 获取 AI 分析报告 API
│   └── export.js                     # 原始数据导出 API（带密码验证）
├── public/
│   ├── data/
│   │   └── report.json               # 静态报告数据（备用/离线使用）
│   ├── favicon.png
│   └── index.html                    # 前端页面
├── scripts/
│   ├── collect-data.js               # 51.la 数据采集脚本（GitHub Actions 用）
│   └── analyze-data.js               # 本地数据分析脚本（生成静态 report.json）
├── package.json                      # 项目依赖
├── netlify.toml                      # Netlify 部署配置
└── README.md                         # 本文档
```

## 🚀 快速开始

### 1. 配置 GitHub Secrets

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加以下密钥：

| Secret | 必填 | 说明 | 示例 |
|--------|:----:|------|------|
| `ACCESS_KEY` | ✅ | 51.la Access Key | `xxxxxxxxxxxxxxxx` |
| `SECRET_KEY` | ✅ | 51.la Secret Key | `xxxxxxxxxxxxxxxx` |
| `SITES` | ✅ | 站点列表（JSON 格式） | `[{"name":"example.com","maskId":"KRFNvLFZwSFuA2NM"}]` |
| `MONGODB_URI` | ✅ | MongoDB 连接字符串 | `mongodb+srv://user:pass@cluster0.mongodb.net` |
| `MONGODB_DB` | ❌ | 数据库名（默认 `website_statistics`） | `website_statistics` |
| `MONGODB_COL` | ❌ | 集合名（默认 `51.la`） | `51.la` |

### 2. 配置部署平台环境变量

#### Netlify / Vercel 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|:----:|------|--------|
| `MONGODB_URI` | ✅ | MongoDB 连接字符串 | - |
| `MONGODB_DB` | ❌ | 数据库名 | `website_statistics` |
| `MONGODB_COL` | ❌ | 集合名 | `51.la` |
| `EXPORT_KEY` | ❌ | 导出接口访问密码，留空则不启用密码保护 | （空） |

### 3. 触发数据采集

工作流支持两种触发方式：

- **定时触发**：每天 UTC 23:30（北京时间 07:30）自动运行
- **手动触发**：GitHub 仓库 → Actions → "51.la Data Collector" → Run workflow

### 4. 部署到 Netlify / Vercel

#### Netlify
1. 连接 GitHub 仓库
2. Build command: 留空（纯静态 + Functions）
3. Publish directory: `public`
4. Functions directory: `api`
5. 在 Site settings → Environment variables 中配置环境变量

#### Vercel
1. 导入 GitHub 仓库
2. Framework Preset: Other
3. Root Directory: `server`
4. 在 Settings → Environment Variables 中配置环境变量

### 5. 本地开发

```bash
cd server
npm install

# 设置环境变量（Windows PowerShell）
$env:MONGODB_URI="mongodb://localhost:27017"

# 运行采集
npm run collect

# 本地预览前端（使用任意静态服务器）
npx serve public
```

## 📡 API 文档

所有 API 均返回 JSON 格式，基础路径为 `/api`。

### 通用响应格式

```json
{
  "success": true,
  "data": { ... }
}
```

错误响应：

```json
{
  "success": false,
  "message": "错误描述"
}
```

---

### 1. 获取站点列表

**GET** `/api/sites`

获取所有已采集数据的站点列表。

**响应示例：**

```json
{
  "success": true,
  "data": {
    "total": 2,
    "sites": [
      { "name": "example.com" },
      { "name": "blog.example.com" }
    ]
  }
}
```

---

### 2. 获取统计数据

**GET** `/api/stats`

获取统计数据，用于前端展示。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `site` | string | ❌ | 站点名，留空或 `all` 返回所有站点总览 |
| `days` | number | ❌ | 最近 N 天数据，默认 `7` |

**响应示例（总览）：**

```json
{
  "success": true,
  "data": {
    "days": 7,
    "overview": {
      "totalSites": 2,
      "totalUv": 1500,
      "totalPv": 3200,
      "totalSv": 1800,
      "totalIp": 1200,
      "totalNew": 800,
      "avgBounceRate": 65.5,
      "avgDuration": 45,
      "avgPvPerUv": 2.13,
      "reportDays": 7,
      "bestSite": "example.com",
      "bestGrade": "良好",
      "weakestSite": "blog.example.com",
      "weakestGrade": "一般"
    },
    "sites": [
      {
        "name": "example.com",
        "today": {
          "uv": 800,
          "pv": 1800,
          "sv": 950,
          "ip": 650,
          "newUser": 420,
          "bounceRate": 55.2,
          "avgDuration": 65,
          "pvPerUv": 2.25
        },
        "yesterday": { ... },
        "compare": {
          "uvChange": 12.5,
          "pvChange": 8.3,
          "svChange": 5.1,
          "ipChange": 10.2,
          "newUserChange": -3.2
        },
        "cumulative": {
          "monthUv": 24000,
          "monthPv": 52000,
          "totalUv": 580000,
          "totalPv": 1200000,
          "topUv": 2100,
          "topPv": 4500,
          "topUvDate": "2026-09-15",
          "topPvDate": "2026-09-20"
        },
        "quality": {
          "bounceRate": { "value": 55.2, "level": "良好", "change": -2.1 },
          "avgDuration": { "value": 65, "level": "良好", "change": 8.5 },
          "pvPerUv": { "value": 2.25, "level": "良好" }
        },
        "trend": {
          "uvTrend": "上升",
          "pvTrend": "平稳",
          "avgUv": 720,
          "avgPv": 1600,
          "todayUvVsAvg": 11.1,
          "todayPvVsAvg": 12.5,
          "daysAnalyzed": 7
        },
        "history": [
          { "date": "2026-10-01", "uv": 680, "pv": 1500, "sv": 800, "ip": 550, "bounceRate": 58.0, "avgDuration": 60, "newUser": 380, "pvPerUv": 2.21 }
        ],
        "overallGrade": "良好"
      }
    ]
  }
}
```

---

### 3. 获取 AI 分析报告

**GET** `/api/analysis`

获取 AI 分析报告数据（基于规则生成的模拟 AI 分析）。
该接口返回的数据可直接用于前端展示，也可导出给外部 AI 系统进行深度分析。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `site` | string | ❌ | 站点名，留空或 `all` 返回总览分析 |
| `days` | number | ❌ | 最近 N 天数据，默认 `7` |
| `key` | string | ❌ | 访问密码（配置了 EXPORT_KEY 时可选验证） |

**响应示例（单站点）：**

```json
{
  "success": true,
  "data": {
    "version": "2.0",
    "generatedAt": "2026-10-07T08:00:00.000Z",
    "generator": "51.LA Analytics Engine",
    "dataSource": "51.LA Open API V6",
    "days": 7,
    "site": {
      "name": "example.com",
      "today": { ... },
      "compare": { ... },
      "quality": { ... },
      "trend": { ... },
      "history": [...],
      "overallGrade": "良好",
      "aiReport": {
        "summary": "example.com 今日 UV 800，PV 1800，较昨日增长 12.5%，综合质量评级为「良好」，近期趋势向好。",
        "keyFindings": [
          { "icon": "📈", "text": "UV 呈上升趋势，日均 UV 720，今日高于均值 11.1%" },
          { "icon": "🎯", "text": "跳出率 55.2%，评级：良好" },
          { "icon": "⏱️", "text": "平均访问时长 65秒，评级：良好" },
          { "icon": "📄", "text": "人均浏览 2.25 页，评级：良好" }
        ],
        "recommendations": [
          {
            "type": "success",
            "title": "跳出率表现良好",
            "detail": "用户留存能力强，跳出率处于良好水平，可继续保持内容质量并加大推广力度。",
            "priority": "low"
          }
        ],
        "deepAnalysis": {
          "trafficPattern": "近期 UV 趋势整体呈「上升」态势，日均 UV 约 720...",
          "userBehavior": "用户跳出率为 55.2%，处于「良好」水平...",
          "growthDrivers": "流量增长势头良好，增长可能来源于内容积累效应...",
          "riskPoints": [
            "UV 趋势下降，需警惕持续下滑风险"
          ],
          "actionPlan": [
            "优化首页和落地页加载速度、增加热门文章和相关推荐模块",
            "优化内链结构，提升用户浏览深度",
            "建立系统化的内容运营体系"
          ]
        },
        "trendOutlook": "未来一段时间流量有望继续保持增长态势，建议乘胜追击..."
      }
    }
  }
}
```

**响应示例（总览）：**

```json
{
  "success": true,
  "data": {
    "version": "2.0",
    "generatedAt": "2026-10-07T08:00:00.000Z",
    "generator": "51.LA Analytics Engine",
    "dataSource": "51.LA Open API V6",
    "days": 7,
    "summary": { ... },
    "sites": [ { "name": "...", "aiReport": { ... } } ],
    "overallAI": {
      "executiveSummary": "共 2 个站点，今日总 UV 1500，总 PV 3200...",
      "crossSiteComparison": {
        "uvGap": "example.com 领先 blog.example.com 约 60%...",
        "pvGap": "...",
        "qualityGap": "...",
        "conclusion": "..."
      },
      "strategicRecommendations": [
        {
          "target": "example.com",
          "strategy": "标杆巩固",
          "focus": "保持领先优势，探索新增长模式",
          "actions": [
            "持续输出高质量内容，巩固流量基本盘",
            "探索新的流量渠道和增长方式"
          ]
        }
      ]
    }
  }
}
```

---

### 4. 原始数据导出

**GET** `/api/export`

从 MongoDB 导出原始数据，带访问密码验证。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `key` | string | ❌ | 访问密码（配置了 `EXPORT_KEY` 时必填） |
| `format` | string | ❌ | 导出格式：`json`（默认）或 `csv` |
| `site` | string | ❌ | 指定站点名，留空则导出全部站点 |
| `days` | number | ❌ | 最近 N 天的数据 |
| `start` | string | ❌ | 开始日期（YYYY-MM-DD） |
| `end` | string | ❌ | 结束日期（YYYY-MM-DD） |

**JSON 响应格式：**

```json
{
  "exportedAt": "2026-10-07T08:00:00.000Z",
  "source": "51.LA Analytics",
  "totalSites": 2,
  "totalRecords": 14,
  "sites": [
    {
      "site": "example.com",
      "recordCount": 7,
      "records": [
        {
          "date": "2026-10-01",
          "data": {
            "curTime": "2026/10/01-2026/10/01",
            "curUv": 680,
            "curPv": 1500,
            "curSv": 800,
            "curIp": 550,
            "curBounceRate": 0.58,
            "curAvgDuration": 60000,
            "beforeUv": 620,
            "beforePv": 1400,
            "monthUv": 21000,
            "totalUv": 579200,
            "...": "..."
          }
        }
      ]
    }
  ]
}
```

**CSV 导出字段：**

`site, date, uv, pv, sv, ip, newUser, bounceRate, avgDurationSec, pvPerUv, beforeUv, beforePv, beforeSv, beforeIp, monthUv, monthPv, totalUv, totalPv`

**状态码：**

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 403 | 密码错误 |
| 405 | 方法不允许 |
| 500 | 服务器错误 |

---

## 🔄 数据流说明

### 数据采集流程

1. **触发**：GitHub Actions 每天定时触发（或手动触发）
2. **采集**：`scripts/collect-data.js` 调用 51.la API 获取各站点数据
3. **存储**：原始 bean 数据原样存入 MongoDB，按 `site + date` 复合唯一键 upsert
4. **完成**：每个站点每天一条记录

### 前端数据加载流程

1. 页面加载时，并行调用 `/api/stats` 和 `/api/analysis`
2. `stats` 接口返回统计数据（用于卡片、图表、质量指标）
3. `analysis` 接口返回 AI 分析报告（用于 AI 分析区域）
4. 用户切换站点/天数时，重新调用对应接口
5. 若 API 不可用，自动降级到 `data/report.json` 静态文件

### 外部 AI 分析流程

1. 外部系统调用 `/api/analysis?key=密码&days=30` 获取结构化分析数据
2. 或调用 `/api/export?key=密码&days=30&format=json` 获取原始数据
3. 外部 AI 系统基于数据生成深度分析报告
4. （可选）将生成的报告推送到 `public/data/report.json` 供前端离线使用

## 📊 数据模型

### MongoDB 文档结构

```javascript
{
  _id: ObjectId,
  site: "example.com",           // 站点名称
  date: "2026-10-07",            // 日期（YYYY-MM-DD）
  updatedAt: ISODate,            // 更新时间
  data: {                        // 51.la 返回的原始 bean 数据
    curTime: "2026/10/07-2026/10/07",
    curUv: 800,
    curPv: 1800,
    curSv: 950,
    curIp: 650,
    curNewUserCount: 420,
    curBounceRate: 0.552,
    curAvgDuration: 65000,
    beforeUv: 711,
    beforePv: 1662,
    // ... 更多 51.la 原始字段
  }
}
```

**索引：** `{ site: 1, date: 1 }` 复合唯一索引

### 51.la API 完整字段

51.la overview 接口返回的 bean 包含以下字段：

| 分类 | 字段 | 类型 | 说明 |
|------|------|------|------|
| **今日** | curTime | string | 今日时间 |
| | curUv | int | 今日访客数 UV |
| | curNewUserCount | int | 今日新访客数 |
| | curSv | int | 今日会话数 |
| | curPv | int | 今日浏览量 PV |
| | curIp | int | 今日 IP 数 |
| | curBounceRate | float | 今日跳出率 |
| | curAvgDuration | float | 今日平均访问时长（毫秒） |
| **昨日** | beforeTime | string | 昨日时间 |
| | beforeUv | int | 昨日访客数 UV |
| | beforeNewUserCount | int | 昨日新访客数 |
| | beforeSv | int | 昨日会话数 |
| | beforePv | int | 昨日浏览量 PV |
| | beforeIp | int | 昨日 IP 数 |
| | beforeBounceRate | float | 昨日跳出率 |
| | beforeAvgDuration | float | 昨日平均访问时长（毫秒） |
| **预测** | predictTime | string | 预计日期 |
| | predictUv | int | 预计访客数 UV |
| | predictNewUserCount | int | 预计新访客数 |
| | predictSv | int | 预计会话数 |
| | predictPv | int | 预计浏览量 PV |
| | predictIp | int | 预计 IP 数 |
| **昨日此时** | yesterdayCurUv | int | 昨日此时访客数 UV |
| | yesterdayCurNewUserCount | int | 昨日此时新访客数 |
| | yesterdayCurSv | int | 昨日此时会话数 |
| | yesterdayCurPv | int | 昨日此时浏览量 PV |
| | yesterdayCurIp | int | 昨日此时 IP 数 |
| | yesterdayCurBounceRate | float | 昨日此时跳出率 |
| | yesterdayCurAvgDuration | float | 昨日此时平均访问时长（毫秒） |
| **历史最高** | topUv | int | 历史最高访客数 UV |
| | topTimeUv | string | 历史最高 UV 日期 |
| | topNewUserCount | int | 历史最高新访客数 |
| | topTimeNewUserCount | string | 历史最高新访客数日期 |
| | topSv | int | 历史最高会话数 |
| | topTimeSv | string | 历史最高会话数日期 |
| | topPv | int | 历史最高浏览量 PV |
| | topTimePv | string | 历史最高 PV 日期 |
| | topIp | int | 历史最高 IP 数 |
| | topTimeIp | string | 历史最高 IP 数日期 |
| | topBounceRate | float | 历史最高跳出率 |
| | topTimeBounceRate | string | 历史最高跳出率日期 |
| | topAvgDuration | float | 历史最高平均访问时长（毫秒） |
| | topTimeAvgDuration | string | 历史最高平均访问时长日期 |
| **本月** | monthUv | int | 月访客数 UV |
| | monthNewUserCount | int | 月新访客数 |
| | monthSv | int | 月会话数 |
| | monthPv | int | 月浏览量 PV |
| | monthIp | int | 月 IP 数 |
| | monthBounceRate | float | 月跳出率 |
| | monthAvgDuration | float | 月平均访问时长（毫秒） |
| **累计** | totalUv | int | 总访客数 UV |
| | totalNewUserCount | int | 总新访客数 |
| | totalSv | int | 总会话数 |
| | totalPv | int | 总浏览量 PV |
| | totalIp | int | 总 IP 数 |
| | totalBounceRate | float | 总跳出率 |
| | totalAvgDuration | float | 总平均访问时长（毫秒） |

## ⚙️ 环境变量

### GitHub Actions

| 变量 | 说明 |
|------|------|
| `ACCESS_KEY` | 51.la Access Key |
| `SECRET_KEY` | 51.la Secret Key |
| `SITES` | 站点列表 JSON |
| `MONGODB_URI` | MongoDB 连接字符串 |
| `MONGODB_DB` | 数据库名 |
| `MONGODB_COL` | 集合名 |

### 部署平台（Netlify/Vercel）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MONGODB_URI` | MongoDB 连接字符串 | - |
| `MONGODB_DB` | 数据库名 | `website_statistics` |
| `MONGODB_COL` | 集合名 | `51.la` |
| `EXPORT_KEY` | 导出接口访问密码，留空则不启用密码保护 | （空） |

## 🔐 安全建议

1. **设置导出密码** - 建议配置 `EXPORT_KEY` 环境变量以保护导出接口，未设置时接口无密码保护
2. **HTTPS** - 确保部署平台启用 HTTPS，防止密码明文传输
3. **密钥管理** - 所有敏感信息都通过环境变量/Secrets 管理，不要硬编码
4. **定期轮换** - 定期更换 51.la 密钥和导出密码
5. **访问控制** - `/api/export` 和带 key 的 `/api/analysis` 接口应妥善保管密码

## 🤝 与外部 AI 系统集成

本系统提供两种方式供外部 AI 系统使用：

### 方式一：使用分析数据（推荐）

调用 `/api/analysis` 接口，获取已结构化的分析数据，直接用于 AI 分析。

```bash
# 获取最近 30 天的分析数据
curl "https://your-domain.com/api/analysis?key=your-password&days=30"
```

优点：
- 数据已结构化，AI 可直接使用
- 包含质量评级、趋势判断、关键发现等预处理结果
- 数据量适中，减少 AI token 消耗

### 方式二：使用原始数据

调用 `/api/export` 接口，获取 51.la 原始数据。

```bash
# 获取最近 30 天的原始数据（JSON）
curl "https://your-domain.com/api/export?key=your-password&days=30&format=json"

# 获取指定站点的 CSV 数据
curl "https://your-domain.com/api/export?key=your-password&site=example.com&format=csv"
```

优点：
- 数据最完整，包含所有 51.la 字段
- 适合需要深度自定义分析的场景

## 📜 License

MIT

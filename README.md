# 51.LA 流量趋势分析 · AI 报告系统

一个基于 51.la 数据的流量趋势分析网站，支持 AI 分析报告展示，采用静态部署架构。

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
                           GET /api/export?key=xxx
                           (带密码的数据导出)
                                        │
┌───────────────────────────────────────┼──────────────────┐
│               外部 AI 系统             │                  │
│  (读取导出数据 → 生成 AI 分析报告)    │                  │
└───────────────────────┬───────────────┘                  │
                        │                                   │
                  git push report.json                      │
                        │                                   │
                        ▼                                   │
              ┌──────────────────┐                          │
              │   Git 仓库       │                          │
              │ public/data/     │                          │
              │   report.json    │                          │
              └────────┬─────────┘                          │
                       │                                    │
                自动部署到 Netlify/Vercel                   │
                       │                                    │
                       ▼                                    │
              ┌──────────────────┐                          │
              │  静态网站部署     │                          │
              │  (纯 HTML+JS)    │                          │
              └────────┬─────────┘                          │
                       │                                    │
              浏览器直接读取 JSON                           │
                       │                                    │
                       ▼                                    │
              ┌──────────────────┐                          │
              │    用户浏览器     │                          │
              │  (流量趋势+AI报告)│                          │
              └──────────────────┘                          │
                                                           │
                     Netlify / Vercel 平台                 │
└──────────────────────────────────────────────────────────┘
```

## ✨ 功能特性

### 数据展示
- 📊 **总览仪表盘** - 多站点数据汇总展示
- 📈 **流量趋势图** - UV/PV 趋势可视化，支持单指标/双指标切换
- 🎯 **流量质量指标** - 跳出率、访问时长、人均页数评级
- 🏆 **多站点对比表** - 横向对比各站点表现

### AI 分析报告
- 🤖 **AI 智能分析** - 外部 AI 生成的深度分析报告
- 💡 **优化建议** - 按类型和优先级分类的改进建议
- 🔍 **深度分析** - 流量规律、用户行为、增长驱动、风险点
- 🔮 **趋势展望** - 未来趋势预测
- 📋 **行动计划** - 分阶段的落地执行方案
- 🎯 **战略建议** - 总览层面的多站点战略规划

### 用户体验
- 🌙 / ☀️ **明暗主题切换** - 支持深色/浅色模式
- 📱 **响应式设计** - 适配桌面端和移动端
- 🔄 **一键刷新** - 重新加载最新报告数据

## 📁 项目结构

```
server/
├── .github/
│   └── workflows/
│       └── collect-51la.yml     # GitHub Actions 采集工作流
├── api/
│   ├── _utils/
│   │   └── handler.js            # Netlify/Vercel 兼容层
│   └── export.js                 # 数据导出 API（带密码验证）
├── public/
│   ├── data/
│   │   └── report.json           # AI 生成的报告数据（外部推送）
│   └── index.html                # 前端页面
├── scripts/
│   └── collect-data.js           # 51.la 数据采集脚本
├── package.json                  # 项目依赖
├── vercel.json                   # Vercel 部署配置
└── netlify.toml                  # Netlify 部署配置
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
| `EXPORT_KEY` | ✅ | 导出接口访问密码 | `your-secret-key` |

### 2. 触发数据采集

工作流支持两种触发方式：

- **定时触发**：每天 UTC 23:30（北京时间 07:30）自动运行
- **手动触发**：GitHub 仓库 → Actions → "51.la Data Collector" → Run workflow

### 3. 生成 AI 报告

**推荐使用 `format=report` 格式**，导出的数据已经是 report.json 的结构（含 today/history/quality/compare/summary），AI 只需添加 `aiReport` 和 `overallAI` 字段即可。

```bash
# 推荐：导出 report 格式（AI 直接用）
curl "https://your-domain.com/api/export?key=your-password&format=report&days=14" > report-data.json

# 原始 JSON 格式（完整原始数据）
curl "https://your-domain.com/api/export?key=your-password&days=14"

# CSV 表格格式
curl "https://your-domain.com/api/export?key=your-password&site=example.com&format=csv"
```

**AI 工作流程：**

1. 调用 `/api/export?format=report&days=14` 获取结构化数据
2. AI 分析数据，为每个站点生成 `aiReport` 字段，总览生成 `overallAI` 字段
3. 将结果保存为 `public/data/report.json`
4. `git commit && git push`，网站自动更新

### 4. 部署到 Netlify / Vercel

#### Netlify
1. 连接 GitHub 仓库
2. Build command: 留空（纯静态）
3. Publish directory: `server/public`
4. Functions directory: `server/api`
5. 在 Site settings → Environment variables 中配置 `EXPORT_KEY` 和 `MONGODB_URI`

#### Vercel
1. 导入 GitHub 仓库
2. Framework Preset: Other
3. Root Directory: `server`
4. 在 Settings → Environment Variables 中配置 `EXPORT_KEY` 和 `MONGODB_URI`

## 📡 API 文档

### GET /api/export

从 MongoDB 导出数据，带访问密码验证。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `key` | string | ✅ | 访问密码（需与环境变量 `EXPORT_KEY` 一致） |
| `format` | string | ❌ | 导出格式：`json`（默认原始）、`csv`、`report`（推荐给 AI） |
| `site` | string | ❌ | 指定站点名，留空则导出全部站点 |
| `days` | number | ❌ | 最近 N 天的数据 |
| `start` | string | ❌ | 开始日期（YYYY-MM-DD） |
| `end` | string | ❌ | 结束日期（YYYY-MM-DD） |

**三种导出格式对比：**

| 格式 | 适用场景 | 特点 |
|------|----------|------|
| `json` | 程序处理、调试 | 51.la 原始字段（curUv/curPv 等），完整原始数据 |
| `csv` | Excel 分析 | 表格格式，可直接打开 |
| `report` | **AI 生成报告** | ✅ 已转换为 report.json 结构，AI 只需添加 aiReport 字段 |

**JSON 响应格式：**

```json
{
  "exportedAt": "2026-09-27T00:00:00.000Z",
  "source": "51.LA Analytics",
  "totalSites": 2,
  "totalRecords": 28,
  "sites": [
    {
      "site": "example.com",
      "recordCount": 14,
      "records": [
        {
          "date": "2026-09-20",
          "data": { "curUv": 120, "curPv": 350, "...": "..." }
        }
      ]
    }
  ]
}
```

**Report 格式响应（推荐给 AI 使用）：**

直接输出与 `report.json` 一致的结构（不含 AI 分析部分），AI 只需在每个站点添加 `aiReport`、在顶层添加 `overallAI` 即可推送：

```json
{
  "version": "1.0",
  "generatedAt": "2026-09-27T00:00:00.000Z",
  "generator": "51.LA Analytics Export API",
  "dataSource": "51.LA Open API V6",
  "summary": {
    "totalSites": 2,
    "totalUv": 2730,
    "totalPv": 7670,
    "reportDays": 14,
    "bestSite": "site1.com",
    "bestGrade": "良好",
    "weakestSite": "site2.com",
    "weakestGrade": "一般"
  },
  "sites": [
    {
      "name": "site1.com",
      "overallGrade": "良好",
      "today": { "uv": 520, "pv": 1280, "ip": 480, "..." : "..." },
      "compare": { "uvChange": 12.5, "pvChange": 8.3, "..." : "..." },
      "quality": {
        "bounceRate": { "value": 45.2, "level": "良好" },
        "avgDuration": { "value": 125, "level": "一般" },
        "pvPerUv": { "value": 2.46, "level": "良好" }
      },
      "history": [
        { "date": "2026-09-20", "uv": 480, "pv": 1150, "..." : "..." }
      ]
    }
  ],
  "overallAI": null
}
```

> 💡 **AI 提示词建议**：调用此格式后，告诉 AI "在每个站点对象中添加 aiReport 字段，在顶层添加 overallAI 字段，其他内容保持不变，输出完整的 JSON"，出错率最低。

**错误响应：**

```json
{
  "success": false,
  "message": "访问密码错误"
}
```

**状态码：**

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 403 | 密码错误 |
| 405 | 方法不允许 |
| 500 | 服务器错误 |

## 📄 report.json 数据格式

AI 生成的报告文件需遵循以下结构：

```json
{
  "version": "1.0",
  "generatedAt": "2026-09-27T21:30:00.000Z",
  "generator": "AI Engine Name",
  "dataSource": "51.LA Open API V6",
  "summary": {
    "totalSites": 2,
    "totalUv": 2730,
    "totalPv": 7670,
    "reportDays": 7,
    "bestSite": "site1.com",
    "bestGrade": "良好",
    "weakestSite": "site2.com",
    "weakestGrade": "一般"
  },
  "sites": [
    {
      "name": "site1.com",
      "overallGrade": "良好",
      "today": {
        "uv": 520,
        "pv": 1280,
        "sv": 650,
        "ip": 480,
        "newUser": 85,
        "bounceRate": 45.2,
        "avgDuration": 125,
        "pvPerUv": 2.46
      },
      "compare": {
        "uvChange": 12.5,
        "pvChange": 8.3,
        "ipChange": 5.1,
        "newUserChange": -3.2
      },
      "quality": {
        "bounceRate": { "value": 45.2, "level": "良好" },
        "avgDuration": { "value": 125, "level": "一般" },
        "pvPerUv": { "value": 2.46, "level": "良好" }
      },
      "history": [
        { "date": "2026-09-21", "uv": 480, "pv": 1150 }
      ],
      "aiReport": {
        "summary": "AI 分析摘要...",
        "keyFindings": [
          { "icon": "📈", "text": "关键发现描述..." }
        ],
        "recommendations": [
          {
            "type": "info",
            "title": "建议标题",
            "detail": "建议详情...",
            "priority": "high"
          }
        ],
        "deepAnalysis": {
          "trafficPattern": "流量规律分析...",
          "userBehavior": "用户行为分析...",
          "growthDrivers": "增长驱动因素...",
          "riskPoints": ["风险点1", "风险点2"],
          "actionPlan": ["短期行动", "中期行动", "长期行动"]
        },
        "trendOutlook": "趋势展望..."
      }
    }
  ],
  "overallAI": {
    "executiveSummary": "总览摘要...",
    "crossSiteComparison": {
      "uvGap": "UV 差距描述...",
      "pvGap": "PV 差距描述...",
      "qualityGap": "质量差距描述...",
      "conclusion": "对比结论..."
    },
    "strategicRecommendations": [
      {
        "target": "目标站点",
        "strategy": "策略类型",
        "focus": "重点方向",
        "actions": ["行动1", "行动2"]
      }
    ]
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 报告版本号 |
| `generatedAt` | string | 生成时间（ISO 格式） |
| `generator` | string | 生成器名称 |
| `dataSource` | string | 数据来源 |
| `summary` | object | 总览摘要 |
| `sites` | array | 各站点数据 |
| `sites[].today` | object | 今日数据 |
| `sites[].compare` | object | 较昨日变化（百分比） |
| `sites[].quality` | object | 质量指标及评级 |
| `sites[].history` | array | 历史数据数组 |
| `sites[].aiReport` | object | 单站点 AI 报告 |
| `overallAI` | object | 总览 AI 分析 |

**推荐类型（type）：**
- `success` - 亮点/优势
- `info` - 一般建议
- `warning` - 需要关注
- `alert` - 紧急问题

**优先级（priority）：**
- `high` - 高优先级
- `medium` - 中优先级
- `low` - 低优先级

**质量等级（level）：**
- `优秀`
- `良好`
- `一般`
- `偏高` / `偏短` / `待优化`

## 🔧 本地开发

### 环境要求
- Node.js 18+
- MongoDB（本地或远程）

### 本地运行采集脚本

```bash
cd server
npm install

# 设置环境变量（Windows PowerShell）
$env:ACCESS_KEY="your-key"
$env:SECRET_KEY="your-secret"
$env:MONGODB_URI="mongodb://localhost:27017"

# 运行采集
npm run collect
```

### 本地预览前端

```bash
# 使用任意静态服务器，例如：
npx serve public
# 或
python -m http.server 8080 --directory public
```

然后访问 `http://localhost:8080`

## 📝 工作流说明

### 数据采集工作流

工作流文件：`.github/workflows/collect-51la.yml`

**触发条件：**
- 定时：`cron: '30 23 * * *'`（每天 UTC 23:30）
- 手动：`workflow_dispatch`

**执行步骤：**
1. Checkout 代码
2. 设置 Node.js 20
3. 安装 `mongodb` 依赖
4. 运行 `scripts/collect-data.js`
5. 采集失败时标记 workflow 失败

### 部署工作流

由 Netlify / Vercel 自动处理：
- 推送 `main` 分支 → 自动部署前端 + API
- 推送新的 `report.json` → 自动更新网站内容

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
| `EXPORT_KEY` | 导出接口访问密码 | `admin123` |
| `MONGODB_URI` | MongoDB 连接字符串 | - |
| `MONGODB_DB` | 数据库名 | `website_statistics` |
| `MONGODB_COL` | 集合名 | `51.la` |

## 🔍 常见问题

### Q: 网站运行几天后就没有 AI 分析了？

**现象：** 前几天正常，之后 AI 分析区域显示"AI 分析待生成"。

**原因分析（按概率排序）：**

1. **AI 生成流程中断** - 外部 AI 没有定时调用导出 API 并推送 report.json
   - ✅ 解决：确保 AI 脚本/工作流每天定时运行
   - ✅ 使用 `format=report` 格式，降低 AI 生成 JSON 的出错率

2. **GitHub Actions 采集失败** - 数据采集失败导致 MongoDB 没有新数据
   - ✅ 检查：GitHub → Actions → "51.la Data Collector" 查看运行状态
   - ✅ 采集脚本自带 3 次重试机制，失败时 workflow 会标红
   - ✅ 常见原因：51.la 密钥过期、MongoDB 连接问题、网络波动

3. **AI 生成的 JSON 格式错误** - AI 输出的 JSON 不符合规范
   - ✅ 使用 `format=report` 格式，AI 只需添加 `aiReport` 字段，出错率最低
   - ✅ 提示词建议："在每个站点对象中添加 aiReport 字段，在顶层添加 overallAI 字段，其他内容保持不变，输出完整的 JSON，不要省略字段"

4. **report.json 没有推送到正确路径**
   - ✅ 确保文件路径是 `public/data/report.json`
   - ✅ 确保推送到 `main` 分支

### Q: 数据日期不对（差一天）？

**原因：** 时区问题。51.la 按北京时间统计数据，但代码用了 UTC 日期。

**解决：** 采集脚本已修复为使用北京时间存储日期。确保你使用的是最新版本的 `scripts/collect-data.js`。

### Q: 导出 API 报错 500？

**常见原因：**
- MongoDB 连接失败（检查 `MONGODB_URI` 环境变量）
- 集合不存在（首次采集后自动创建）
- 密码错误（返回 403，不是 500）

**调试：** 在 Vercel/Netlify 的函数日志中查看详细错误信息。

## 🔐 安全建议

1. **修改默认密码** - 部署时务必修改 `EXPORT_KEY`，不要使用默认值
2. **HTTPS** - 确保部署平台启用 HTTPS，防止密码明文传输
3. **密钥管理** - 所有敏感信息都通过环境变量/Secrets 管理，不要硬编码
4. **定期轮换** - 定期更换 51.la 密钥和导出密码

## 📜 License

MIT

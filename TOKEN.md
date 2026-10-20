# Cloudflare API Token 配置指南

> **dev 分支（Workers + D1）** 的权限要求见第一节「dev 分支」；main 分支见原有文档。

---

## 〇、dev 分支（Workers + D1）权限要求

| 权限 | 用途 | 是否必需 |
|------|------|:--------:|
| `Account → Analytics → Read` 或 `Zone → Analytics → Read` | GraphQL Analytics 流量数据、Workers/D1 用量查询 | ✅ |
| `Account → D1 → Read` | 读取 D1（快照/设置/报告） | ✅ |
| `Account → D1 → Write` | 写入 D1 快照与设置 | ✅ |
| `Account → Workers Scripts → Edit` | 部署 Worker（注意：仅 Read 无法部署） | ✅ |
| `Account → Account Settings → Read` | 列出账户（额度/部署需要账户 ID，也可通过 zones 推断） | ⚠️ 建议 |

> ⚠️ **重要**：API Token 模板中的「Workers Editor」可能只含 Read 权限；部署必须确认 **Workers Scripts → Edit**。
> 「WAF 拦截」指标需要额外的 Firewall 分析权限（Token 无权限时该指标静默降级为 0，不影响其他功能）。

**所需环境变量（GitHub Actions secrets 仅需两个）**：

- `CLOUDFLARE_API_TOKEN`：上述 Token（同时用于部署与运行时数据查询）
- `EXPORT_KEY`：导出/管理密钥（未配置则禁用导出密码与管理功能，公开访问）

本地开发时复制 `.dev.vars.example` 为 `.dev.vars` 并填入 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `EXPORT_KEY`（该文件已被 gitignore）。

---

## 一、main 分支权限要求

| 权限 | 用途 | 是否必需 |
|------|------|:--------:|
| `Zone → Analytics → Read` | 调用 GraphQL Analytics API 获取流量数据 | ✅ 必需 |
| `Zone → Zone → Read` | 通过 REST `/zones` 自动发现站点列表 | ⚠️ 二选一 |
| （不配 Zone Read，改用 `CF_ZONES` 环境变量指定站点） | 最小权限方案 | ⚠️ 二选一 |

---

## 二、创建 Token（图文步骤）

### 1. 进入创建页面

打开 Cloudflare 控制台的 [API Tokens 页面](https://dash.cloudflare.com/?to=/:account/api-tokens) → 点击 **Create Token** → 在 **Custom token** 一栏点击 **Get started**。

### 2. 配置权限

**Token name**：随意，例如 `website-analytics-readonly`

**Permissions**（权限下拉框，按三列依次选择）：

- 方案 A（推荐，自动发现站点）：
  - `Zone` → `Analytics` → `Read`
  - `Zone` → `Zone` → `Read`
- 方案 B（最小权限，站点需手动配置）：
  - `Zone` → `Analytics` → `Read`

**Zone Resources**（站点范围）：

- `Include` → `All zones`（全部站点）
- 或 `Include` → `Specific zone` → 指定域名（只暴露指定站点，更安全）

**其他可选项（均可留空）**：

- Client IP Address Filtering：可限制调用方 IP（Serverless 平台出口 IP 不固定，**不建议设置**）
- TTL：可设置 Token 有效期（建议定期轮换）

### 3. 创建并保存 Token

点击 **Continue to summary** → **Create Token**，页面会显示一次完整 Token，**立即复制保存**（关闭后无法再查看，只能重新生成）。

---

## 三、环境变量配置

### 变量一览

| 变量 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `CLOUDFLARE_API_TOKEN` | ✅ | 上一步创建的 Token（也接受别名 `CF_API_TOKEN`） | `abcd1234...` |
| `CLOUDFLARE_ACCOUNT_ID` | ❌ | 限定账号 ID（自动发现站点时按账号过滤；多账号用户建议配置） | `f787...` |
| `CF_ZONES` | ❌ | 站点白名单，逗号分隔或 JSON 数组。设置后**无需** Zone Read 权限，站点列表通过 GraphQL `zoneName` 解析 | `a.com,b.com` 或 `["a.com","b.com"]` |
| `EXPORT_KEY` | ❌ | `/api/export` 导出接口访问密码，防滥用；未设置则无密码保护（**生产环境强烈建议设置**） | `my-secret-2026` |

### 在哪配置

- **Netlify**：Site settings → Environment variables → Add a variable
- **Vercel**：Project → Settings → Environment Variables（记得勾选 Production/Preview/Development）
- **本地真实数据调试**（PowerShell）：

```powershell
$env:CLOUDFLARE_API_TOKEN = "你的Token"
$env:CF_ZONES = "example.com,blog.example.com"
node server/test-server.js   # 注：test-server.js 为 Mock 数据；真实联调请直接部署预览环境
```

> 本地开发默认走 `npm run dev` 的 Mock 数据，**无需 Token**。Token 只应配置在部署平台服务端，切勿提交到仓库或写进前端代码。

---

## 四、验证 Token 是否生效

### 命令行直接测试（推荐）

```bash
# 测试 Token 有效性
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer 你的Token"
# 返回 "success": true 即有效

# 测试 GraphQL Analytics 查询（替换 zoneTag）
curl "https://api.cloudflare.com/client/v4/graphql" \
  -H "Authorization: Bearer 你的Token" \
  -H "Content-Type: application/json" \
  -d '{"query":"query($z:[string!]){viewer{zones(filter:{zoneTag_in:$z}){httpRequests1dGroups(limit:7,filter:{date_geq:\"2026-10-12\"},orderBy:[date_ASC]){dimensions{date} sum{requests pageViews} uniq{uniques}}}}}","variables":{"z":["你的zoneId"]}}'
```

### 部署后通过本站验证

- `GET /api/sites` → 返回站点列表（成功 = Token + 站点发现均正常）
- `GET /api/stats?site=all&range=7d` → 返回聚合数据（成功 = Analytics 权限正常）
- 常见错误对照：

| 报错 | 原因与解决 |
|------|-----------|
| `未配置 CLOUDFLARE_API_TOKEN 环境变量` | 部署平台未配置变量，或配置后未重新部署 |
| `获取站点列表失败（REST /zones）: ... not permitted` | Token 缺 `Zone → Zone → Read`，补权限或改用 `CF_ZONES` 白名单 |
| `GraphQL 查询错误: not entitled for zone` | Token 的 Zone Resources 未覆盖该站点 |
| HTTP 403/400 `invalid headers` | Token 拼写错误或已失效/过期，重新生成 |

---

## 五、安全建议

1. **最小授权**：只给 `Analytics Read`（+ 可选 `Zone Read`），绝不授予 `Edit` 类权限
2. **限制站点范围**：Zone Resources 只勾选需要分析的站点，或用 `CF_ZONES` 白名单
3. **定期轮换**：建议每 90 天重新生成 Token 并更新环境变量
4. **服务端专用**：Token 只存在于部署平台环境变量中，前端/仓库中不得出现
5. **导出接口加锁**：生产环境务必配置 `EXPORT_KEY`，避免原始数据被无密码批量拉取

---

## 六、相关文档

- 项目总体说明：[README.md](file:///c:/Users/A/Desktop/projects/website-analytics/server/README.md)
- [Cloudflare 官方：Configure an Analytics API token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
- [Cloudflare GraphQL Analytics API 文档](https://developers.cloudflare.com/analytics/graphql-api/)

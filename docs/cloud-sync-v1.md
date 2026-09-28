# DELF50 Cloud · 账号与学习记录云端存储（v1）

本层为网站加入账号登录与学习记录自动云端保存，**不修改任何现有学习逻辑与内容**。现有代码只改动了一处：`index.html` 在加载器之前多了一行 `<script src="/cloud/delf50-cloud.js"></script>`。

## 1. 总体架构

```
浏览器（现有应用，照旧读写本机）                          Vercel Functions            数据层
┌───────────────────────────────────┐                  ┌──────────────────┐     ┌──────────────────────┐
│ localStorage['delf50_v12_state']  │◀── 观察写入 ──┐   │ /api/v1/*        │     │ Neon Postgres        │
│ IndexedDB delf50_audio_v1.clips   │◀── 观察录音 ──┤   │  auth · sync ·   │────▶│  schema delf50       │
└───────────────────────────────────┘               │   │  media · events  │     │  (真源 + 历史 + 读模型)│
┌───────────────────────────────────┐               │   └──────────────────┘     └──────────────────────┘
│ cloud/delf50-cloud.js             │───────────────┘            │               ┌──────────────────────┐
│  • 启动闸门：首轮拉取完成才放行 bundle │── HTTPS (Cookie) ──────▶│──预签名 URL──▶│ Cloudflare R2        │
│  • 三方合并 · 语义指纹 · 录音同步     │──────── 直传/直取录音 ─────────────────────▶│  delf50-learning     │
└───────────────────────────────────┘                                            └──────────────────────┘
```

**设计原则**

| 原则 | 实现 |
|---|---|
| 本机优先 | 应用仍然只读写 localStorage / IndexedDB。未登录、离线、API 故障时，应用行为与之前完全一致。 |
| 精确 | 同步的是应用写入 localStorage 的**原始文本**（服务端以 `text` 原样存储，`jsonb` 会重排键）。两端都校验 SHA-256：上传后服务端复算，下载后浏览器复算。 |
| 不丢数据 | 每次上传都是基于服务端版本号的 compare-and-swap；冲突走三方合并；被替换的本机副本先存档到服务端；每个云端版本都进入历史，可一键恢复。 |
| 不打扰 | 应用每次启动都会刷新约 8 个簿记时间戳。同步层用**语义指纹**（去掉 `at`/`*At` 键、根级 `version`、`meta172`）判断是否真有学习变化：仅簿记变化既不上传，也不会让其他设备刷新。 |
| 应用自己加载数据 | 远端数据只在两个时机进入应用：① 页面启动时（bundle 下载等待首轮拉取，最多 8 秒）；② 需要载入其他设备的新进度时，在安全时刻（不在录音、不在输入框中）写入 localStorage 并刷新页面。应用始终从自己写过的文档启动，并跑自己的迁移。 |

## 2. 同步算法

设本机文本 `L`、同步基线 `B`（最近一次与服务端一致的文档，存于 IndexedDB `delf50_cloud_v1`，版本号/哈希/语义哈希存于 `localStorage['delf50_cloud_meta_v1']`），服务端头版本 `R`。

- **推送**：应用每次写入 localStorage 后 2.5 秒（最长 15 秒）触发；页面隐藏时立即触发（keepalive）。若 `sem(L) = sem(B)` 则无需推送。否则 `PUT /sync/state`，携带 `Base-Rev = rev(B)`。服务端在单事务内比较版本：一致则写入新版本、历史与读模型；不一致返回 409。
- **拉取**：启动时、页面重新可见时、每 60 秒（仅可见时）、网络恢复时。`GET /sync/state?have=rev(B)`，无变化返回 204（无正文）。
- **协调**（服务端已前进）：
  1. `L = R`（字节相同）→ 仅更新基线。
  2. `sem(R) = sem(B)`（对方只动了簿记）→ 基线前移，页面不动；若本机有学习变化则随后推送。
  3. `sem(L) = sem(R)` → 仅更新基线。
  4. 本机无学习变化 → 采用 `R`（启动前直接写入；运行中则刷新载入）。
  5. 双方都有学习变化且有基线 → **三方合并** `merge3(B, L, R)` 后载入并推送。
  6. 无共同基线（登录前两台设备各自学过）→ 弹窗让学习者选择：合并两份 / 使用云端 / 使用本设备。被替换的一份先存档到 `state_archives`。

**三方合并规则**（`cloud/delf50-cloud.js · merge3`）

| 数据 | 规则 |
|---|---|
| 仅一侧修改 | 取修改的一侧（精确）。 |
| 对象（答题表、每日进度、草稿等） | 按键递归合并；一侧删除且另一侧未改动 → 删除；一侧删除而另一侧修改过 → 保留修改（证据优先）。 |
| 计数器（`attempts / correct / count / totalSec / a / c` 及每日各模块计数） | `B + (L−B) + (R−B)`：两台设备各做 3 题 → 合计 +6。 |
| 数组（记录、错题、分配） | 多重集合三方合并：双方删除只删一次，双方相同的新增视为同一事件去重；带 `at` 的记录按时间排序并保持原方向（错题最新在前）。 |
| `first*/started*` 时间 | 取较早；其他 `*At` 取较晚。 |
| 其他标量（`selectedDay`、游标等） | 取最后保存（`lastSavedAt` 较新）的一侧。 |

## 3. 数据库（Neon · schema `delf50`）

迁移文件：`db/migrations/0001_init.sql`（幂等）。

| 表 | 用途 |
|---|---|
| `users` | 账号（scrypt 密码哈希，邮箱大小写不敏感唯一） |
| `devices` | 每个安装一行（浏览器 / 未来的 iOS、Android 客户端） |
| `sessions` | 会话；仅存 token 的 SHA-256。`cookie`（网页）与 `bearer`（App）两种 |
| `auth_attempts` | 登录/注册/改密限流（持久化，跨函数实例生效） |
| `learning_state` | **真源**：每人一份，原始文本 + 版本号 + 哈希 |
| `learning_state_revisions` | 历史（gzip）。保留：非自动推送的全部、最近 40 次、14 天内每小时首个、每天首个 |
| `state_archives` | 被替换的本机副本 |
| `learning_stats` · `daily_progress` · `item_answers` · `content_completions` · `production_records` · `error_items` | **读模型**：每次推送在同一事务内按差量更新；供进度 API、统计分析与未来 App 使用，从不回写网页 |
| `media_objects` | R2 对象登记；`scope='user'` 为个人录音，`scope='content'` 预留给课程听力音频 |
| `learning_events` | 原生 App 的细粒度事件日志（幂等、游标分页） |

核心写入是 `delf50.push_state(...)`：行锁 → 版本比较 → 更新头 → 写历史 → 应用读模型差量 → 清理历史，全部一个事务。重试同一内容返回 `same`，天然幂等。

## 4. API（`/api/v1`）

所有路由由单个函数 `api/v1.js` 处理（`vercel.json` 把 `/api/v1/*` 改写过去），不占用 Hobby 计划的函数配额。

| 方法 路径 | 说明 |
|---|---|
| `GET health` | 数据库 / R2 / 注册开关状态 |
| `POST auth/register` | `{email,password,displayName?,inviteCode,client?,transport?}` |
| `POST auth/login` | `{email,password,client?,transport?}`；`transport:"bearer"` 返回 App 用 token |
| `POST auth/logout` · `GET auth/me` · `POST auth/password` · `GET/DELETE auth/sessions[/:id]` | 会话管理；改密会登出其他所有会话 |
| `GET sync/state?have=<rev>` | 原始文档（头：`X-DELF50-Rev`、`X-DELF50-Hash`）；无变化 204 |
| `PUT sync/state` | 原始文档（可 gzip），头：`X-DELF50-Hash`、`X-DELF50-Base-Rev`、`X-DELF50-Reason`、`X-DELF50-Encoding` |
| `GET sync/revisions[/:rev]` · `POST sync/restore` | 历史与恢复（恢复生成新版本，不改写历史） |
| `POST sync/archive` · `GET sync/archives[/:id]` | 本机副本存档 |
| `GET progress/summary` · `GET progress/answers\|productions\|completions?module=&day=` | 读模型 |
| `GET media` · `POST media/upload-url` · `POST media/complete` · `PUT/GET media/raw` · `GET media/url` · `DELETE media` | 录音（R2） |
| `POST events` · `GET events?after=&limit=` | App 事件日志 |

**安全**：Cookie 为 `HttpOnly; Secure; SameSite=Lax`；Cookie 认证的写请求必须带 `X-DELF50-Client` 头且 Origin 同源（CSRF）。Bearer token 不能当 Cookie 用。注册需要邀请码（`DELF50_INVITE_CODE`）。登录失败 8 次/15 分钟锁定该邮箱，40 次/15 分钟锁定该 IP。

## 5. 录音（Cloudflare R2）

对象键：`u/<userId>/speaking/<clipId>.<ext>`。上传：`upload-url` 取 15 分钟预签名 PUT → 浏览器直传 R2 → `complete`（服务端 HEAD 核实真实大小）。若浏览器无法直连 R2（例如桶未配置 CORS），自动改走函数中转（≤ 4 MB）。其他设备登录后，状态中引用、但本机 IndexedDB 没有的录音会被下载写入应用自己的 `delf50_audio_v1`，应用原有的回放功能直接可用。SigV4 签名器为零依赖实现，已用 AWS 官方测试向量验证。

## 6. 为未来 App 预留

- **认证**：`transport:"bearer"` 登录，token 有效期 180 天（滑动续期），`devices.platform` 区分 `ios/android/desktop`。
- **两条同步路径**：若 App 复用网页的学习引擎（WebView/共享 JS），直接使用同一份 `sync/state` 文档与同一套合并算法；若 App 是原生重写，可写入 `learning_events`（幂等），读取 `progress/*` 读模型，二者互不干扰。
- **课程音频**：`media_objects.scope='content'`、`kind='listening_audio'` 已预留，未来可把听力音频放进 R2 并由 App 离线缓存。

## 7. 部署与配置

Vercel 项目 `delf50-mvp` 已配置：

| 变量 | 状态 |
|---|---|
| `DATABASE_URL` | ✅ 已设置（Neon `DELF-Learning` 主分支，pooled） |
| `DELF50_INVITE_CODE` | ✅ 已设置（注册所需邀请码） |
| `R2_BUCKET` | ✅ `delf50-learning`（已创建） |
| `R2_ACCOUNT_ID` | ⏳ 待填：Cloudflare 账号 ID |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | ⏳ 待填：R2 API Token（见下） |
| `DELF50_MAX_USERS` | 可选：账号数量上限 |

未配置 R2 时一切照常，只是录音暂存本机；配置后下一次同步会自动补传全部历史录音。

**创建 R2 API Token**：Cloudflare 控制台 → R2 → Manage R2 API Tokens → Create API Token → 权限 *Object Read & Write*，限定桶 `delf50-learning` → 得到 Access Key ID 与 Secret Access Key；账号 ID 在 R2 概览页右侧。

**R2 CORS**（可选，让浏览器直传直取，省去函数中转）：R2 → `delf50-learning` → Settings → CORS Policy：

```json
[
  {
    "AllowedOrigins": ["https://delf50-mvp.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

**数据库迁移**：`DATABASE_URL=… npm run db:migrate`（已在生产库执行过 `0001_init`）。

**部署**：`vercel --prod`（本项目为 CLI 部署）。`package.json` 只有运行时依赖 `@neondatabase/serverless`，没有 build 脚本，Vercel 仍按静态站点 + 函数处理。

## 8. 验证

```bash
node scripts/verify.js           # 原有 41 项（内容与学习记录保护）——不受影响
TEST_DATABASE_URL=postgres://…  NODE_PATH=<含 jsdom、pg、fake-indexeddb 的目录> node scripts/verify-cloud.js
```

`verify-cloud.js` 共 112 项：SigV4 官方向量、合并与投影单元测试；在真实 PostgreSQL 上跑完整 API（CSRF、限流、并发 CAS 只有一个胜出、字节级往返、历史恢复、读模型、事件幂等、R2 签名校验与越权隔离）；再用 jsdom 把真实 `index.html` + 云同步层 + 应用 bundle 作为多台设备运行：带既有进度注册上传、第二台设备接收、两台设备同时学习后合并计数精确相加、无共同基线时的选择弹窗、共用设备切换账号、录音上传与跨设备恢复、重开应用不产生新版本也不触发其他设备刷新。

线上排障：浏览器控制台执行 `__DELF50_CLOUD.status()` 可看到同步状态、元数据与最近 60 条同步轨迹。

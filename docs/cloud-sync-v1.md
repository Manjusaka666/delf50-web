# DELF50 Cloud · 账号与学习记录（v2 架构，API v1）

**三条原则：** Neon Auth 是唯一身份源；Neon PostgreSQL 是唯一的结构化数据源；Cloudflare R2 是唯一的二进制存储。浏览器只保留当前页面的内存状态，不再有“先存本机、再上传”。

现有应用代码与内容**一行未改**；`index.html` 仍只多一行 `<script src="/cloud/delf50-cloud.js">`。

## 1. 数据流

```
浏览器                                   Vercel fra1 · /api/v1               Neon (eu-central-1)        R2
┌──────────────────────────────┐        ┌──────────────────────┐          ┌───────────────────┐
│ 现有应用（未改）               │        │ auth/*  → Neon Auth   │─────────▶│ neon_auth.*        │
│  localStorage.setItem(S)  ───┼─内存──▶│ bootstrap · sync · rev│─1 个事务─▶│ delf50.* （RLS）   │
│  IndexedDB clips.put/get  ───┼────────▶ media/raw            │────────────────────────────────────▶ 录音
│ cloud/delf50-cloud.js         │        └──────────────────────┘          └───────────────────┘
│  · 登录闸门：载入账号数据后才启动应用                                                                   
│  · 每次保存：与“服务器已确认状态”做差异 → 60–300 ms 内发出细粒度变更（同一时间只有一个请求）
└──────────────────────────────┘
```

* **启动**：应用 bundle 的下载与 `GET bootstrap` 并行；bootstrap 从各表重建应用的状态对象 S，放入内存中的 `delf50_v12_state`，然后才执行 bundle。未登录时显示登录/注册框，应用不启动。
* **保存**：应用每次 `save()` 写入内存；客户端计算与上次确认状态的差异（文档按字段、记录按条），`POST sync` 在**一个事务**里写入所有表并返回 `rev`。批次幂等：失败自动重试（指数退避），重复提交不会产生重复数据。页面关闭时用 `keepalive` 补发，未保存时离开页面会提示。
* **录音**：应用写入 `delf50_audio_v1` 时直接上传 R2（≤ 3.5 MB 一段，经函数中转；R2 桶没有浏览器 CORS）；播放时从 R2 取回。浏览器中不存录音。
* **多设备**：页面回到前台时比较 `rev`；如其他设备已保存，则重新载入，始终以数据库为准。
* **会话过期**：保存得到 401 时弹出登录框；重新登录后，未保存的修改自动补存（换了账号则重新载入）。
* **浏览器存储**：不写入任何学习数据；旧版本留在浏览器里的数据既不读取也不删除。
* **网站本体缓存**：`/api/source` 的 13 个分段带内容哈希 ETag（`Cache-Control: public, max-age=0, must-revalidate`，Vercel CDN 按部署缓存）。云端层把加载器的第一次请求改为走浏览器 HTTP 缓存并用 ETag 重新验证：版本未变时每段只返回 304，约 600 KB 的程序只在发布新版本后下载一次；重试请求仍按加载器原样不走缓存。

## 2. 数据库（`db/migrations/0001_learning.sql`）

| 表 | 内容 | 键 |
|---|---|---|
| `study_state` | 非记录类工作状态：学习计划（assignments172、dayPlans172）、内容路由、设置（jsonb 文档）+ `rev` | user_id |
| `reading_answers` / `listening_answers` | 每道客观题的作答 | (user, answer_key) |
| `grammar_attempts` | 语法选择题（题干、选项、所选、正确项、对错、作答时间），**只追加**：内容变化追加一行，重放不追加，删除写墓碑行；API 角色无 UPDATE/DELETE 权限 | id |
| `grammar_productions` | 语法主动产出练习（`prodDone["天:语法点:题号"]`） | (user, prod_key) |
| `writing_submissions` / `application_submissions` | 写作与应用任务（正文、字数、连接词、命中表达、标题、时间） | (user, item_key)，`pos` 保序 |
| `speaking_attempts` | 口语记录（录音 clip_id、时长；线下练习 manual） | 同上 |
| `error_items` | 错题本；在应用中“已纠正”后行保留并标记 `resolved_at` | 同上 |
| `task_checks` | 每日任务清单勾选（`taskDone["天:任务"]`） | (user, task_key) |
| `daily_progress` · `study_days` · `practice_counters` | 每日各模块计数 · 学习日（首次/最后活动、次数）· 词块与复习练习数 | (user, day_key) |
| `drafts` | 正在写的草稿（写作/应用） | (user, kind, key) |
| `content_completions` | 每个内容的完成记录 | (user, module, content_id) |
| `media_objects` | R2 对象记录（大小经 HEAD 核验后才为 stored） | (user, clip_id) |
| `vocabulary_items` · `user_vocabulary` · `vocabulary_reviews` | 共享词典 · 个人词库（SM-2）· 复习日志（只追加） | |
| 视图 `daily_activity` | 每日各模块活动量，由记录**派生**，不重复存储 | |

* 记录字段类型匹配时进入强类型列（int / text / bool / 精确到毫秒的 ISO 时间），其余进入 `extra jsonb`，因此每条记录都能**逐字节语义等价**地读回。
* 所有用户表 `user_id → neon_auth.user(id) on delete cascade`，默认值为当前调用者。
* **RLS**：API 以无 BYPASSRLS 的角色 `delf50_api` 连接；每个事务先 `set_config('app.user_id', …)`，策略 `user_id = delf50.uid()`。该角色读不到 `neon_auth`；会话校验经 `security definer` 函数 `delf50.session_user(token)`。

## 3. API（`api/v1.js`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `health[?deep=1]` | 数据库 / Auth / R2 状态 |
| * | `auth/<route>` | 代理 Neon Auth：`sign-up/email`、`sign-in/email`、`get-session`、`sign-out`、`token` … Cookie 因此成为本站第一方 Cookie |
| GET | `bootstrap` | `{user, state, rev, positions, collections}` |
| POST | `sync` | `{doc:[[path,value]|[path]], ops:{集合:{set:[[key,value,pos?]],del:[key]}}}` → `{rev}` |
| GET | `rev` | 最新修订号 |
| PUT/GET | `media/raw?clipId&type&size&part&parts` | 分段上传 / 下载录音 |
| POST | `media/upload-url` · `media/complete` | App 用预签名直传 |
| GET · DELETE | `media` · `media/url` | 列表 / 预签名下载 / 删除 |
| GET · POST · DELETE | `vocab` · `vocab/review` | 词库与 SM-2 复习 |

身份：网页用 Neon Auth 会话 Cookie（每个函数实例缓存 60 s）；**未来 App** 用 `Authorization: Bearer <Neon Auth JWT>`（EdDSA，按 JWKS 校验）或会话 token。

## 4. 配置

Vercel 环境变量：

| 变量 | 值 |
|---|---|
| `DATABASE_URL` | Neon **pooled** 连接串，角色 `delf50_api`（不是 owner） |
| `NEON_AUTH_BASE_URL` | Neon 控制台 Auth 页的 Auth URL（…/neondb/auth） |
| `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` | Cloudflare R2（`R2_ENDPOINT` 可选） |

Neon Auth 的受信任域名需包含站点域名（`https://delf50-mvp.vercel.app`）。迁移：`DATABASE_URL=<owner 连接串> npm run db:migrate`，然后 `alter role delf50_api login password '…'`。

## 5. 验证

所有验证都在云端运行：Vercel Sandbox（fra1）中执行，数据库使用 Neon **测试分支**（`ci-cloud-sync-test`）上的专用数据库 `delf50_ci`，从不触碰生产数据，也不使用任何本地数据库。测试依赖只在 Sandbox 中安装：`npm i --no-save jsdom@24.1.3 pg@8.23.0 fake-indexeddb@6.2.5`。

* `npm run verify` — 原有 41 项应用检查。
* `TEST_DATABASE_URL=<测试分支 delf50_ci 的 owner 连接串> npm run verify:cloud` — 单元 + Neon PostgreSQL（以 RLS 角色连接）+ Neon Auth 模拟（真实 Cookie 与 EdDSA JWT）+ S3 签名校验模拟 + jsdom 中运行真实应用：登录闸门、保存延迟 < 500 ms、浏览器零持久化、刷新/第二设备/跨设备刷新、8 MB 录音、会话过期不丢数据、退出登录。
* `DATABASE_URL=… NEON_AUTH_BASE_URL=… R2_…=… npm run smoke:live` — 真实 Neon 数据库 + 真实 Neon Auth + 真实 R2 的端到端检查（使用测试分支，临时账号用后即删）。

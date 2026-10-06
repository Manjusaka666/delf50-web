# DELF50

A1+ → DELF B1 的 50 天网页备考课程。生产地址：<https://delf50-mvp.vercel.app>

每天的学习材料是固定的：12 道语法题、4 篇阅读、4 组听力、2 项写作、4 轮口语、4 项应用任务，外加按语法点的主动产出提示。学习者选择每日强度（5 / 6.5 / 8 小时），强度只决定当天需要完成其中的多少（固定序列的前缀），超出部分可以选做。所有作答、草稿、写作、录音都实时保存在账号中（Neon Postgres + Cloudflare R2），浏览器里不存任何学习数据。

## 结构

```
index.html          入口（只加载 app/main.js 和 app/app.css）
app/                前端（原生 ES 模块，无构建步骤）
  main.js           登录、路由、外壳（桌面侧栏 / 移动端底栏）、事件委托、页面过渡
  views/            今日 · 语法与主动产出 · 阅读/听力 · 写作/应用 · 口语 · 错题本 · 进度 · 档案 · 路线 · 指南
  state.js          学习者状态的形状与全部修改操作
  progress.js       进度、完成度、正确率——全部由记录推导，不存储
  course.js         课程数据加载与每日计划（强度 → 前缀）
  store.js          载入与实时保存（差量批次、重试、多设备刷新）
  sync-core.js      状态差量算法（前端与测试共用）
  media.js          录音分段上传 / 下载（经 API 存入 R2）
  speech.js         听力的法语语音合成
  ui.js             模板、法语排版（窄不换行空格、’）、图标、格式化（瑞士时间）
  app.css           设计系统
course/             课程数据（唯一题库）
  course.json       50 天路线、四个阶段、强度配额、资料来源
  grammar.json      36 个语法点：讲解、例句、产出提示
  days/01–50.json   每天的全部题目
fonts/              自托管字体（Fraunces、Inter，OFL）
api/v1.js           API（Vercel 函数）：Neon Auth 代理、bootstrap、sync、media、vocab
api/_lib/           records.js（状态 ↔ 数据表映射）、session、db、r2、media、vocab、courses
db/migrations/      数据库结构（幂等，按序执行）
scripts/            检查与运维脚本
```

## 数据

状态 `S`（`app/state.js`）只有设置和学习记录：

| 字段 | 内容 | 数据表 |
|---|---|---|
| `day` `intensity` `startedAt` `onboarded` | 设置 | `study_state.doc` |
| `reading` `listening` | `"<天>:<题组>:<题>"` = 选项 | `reading_answers` / `listening_answers` |
| `grammar` | `"<天>:<题>"` = 作答（只追加历史） | `grammar_attempts` |
| `production` | `"<天>:<语法点>:<提示>"` = 完成 | `grammar_productions` |
| `writing` `application` | 提交的文本 | `writing_submissions` / `application_submissions` |
| `speaking` | 口语轮次（`clip` = R2 中的录音） | `speaking_attempts` + `media_objects` |
| `errors` | 错题本（掌握后在库中标记为 resolved） | `error_items` |
| `drafts` | 写作 / 应用草稿 | `drafts` |
| `practice` | 每天的词块 / 复习数量 | `practice_counters` |

每条记录是一行，按 `(user_id, course, key)` 存储，行级安全按用户隔离。保存是差量的：每次修改在 60–300 ms 内只发送变化的行；重放同一批次不会改变数据。服务器上以其他键存储的列表行（例如数据迁移改写过的行）会在下次保存时原地改名，不会重复或丢失。

完成度从记录推导：阅读 / 听力的一篇在所有题都作答后完成；写作、应用、口语在有提交后完成；一天在当前强度下的所有模块都完成后完成。

`content_completions`、`daily_progress`、`study_days`、`task_checks` 四张表已不再读写（旧版的派生数据），保留待确认后删除。

## 检查

```bash
node scripts/verify.js        # 课程数据（50 天逐项）、每日计划、进度引擎、状态操作、法语排版、模块图
node scripts/verify-cloud.js  # 单元 + API（真实 PostgreSQL）+ 浏览器端到端（Chromium）
```

`verify-cloud.js` 需要一个可清空的数据库（`TEST_DATABASE_URL`，Neon 测试分支或本地 PostgreSQL）和测试依赖 `npm i --no-save pg playwright`（浏览器部分从 `NODE_PATH` 解析 Playwright）。它在测试库中建立 Neon Auth 与 R2 的模拟服务，用 `delf50_api` 角色运行真实的 API，并在 Chromium 中跑完整的学习流程。

`scripts/smoke-live.js` 对真实的 Neon Auth / 数据库 / R2 做冒烟测试（使用测试分支）。

## 部署

Vercel（fra1）：静态文件 + `api/v1.js`。环境变量：`DATABASE_URL`（`delf50_api` 角色）、`NEON_AUTH_BASE_URL`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`。数据库结构变更：`DATABASE_URL=<owner> node scripts/db-migrate.js`。

`vercel.json` 设置内容安全策略和缓存：`app/`、`course/` 每次重新验证（ETag），字体长期缓存。

## 多级别

存储层按课程划分（`?course=`，默认 `delf-b1`），见 [docs/multi-level-architecture.md](docs/multi-level-architecture.md)。

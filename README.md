# DELF50

按 CEFR 级别划分的 50 天网页备考课程，学习者可在顶栏随时切换级别，各级别的计划、进度和记录互不影响。生产地址：<https://delf50-mvp.vercel.app>

| 级别 | 课程 | 每日强度 | 每天的固定材料（最高强度） |
|---|---|---|---|
| B1 | A1+ → DELF B1（`course/`） | 5 / 6.5 / 8 小时 | 12 道语法题、4 篇阅读、4 组听力、2 项写作、4 轮口语、4 项应用、45 个词块 |
| B2 | B1 → DELF B2，含 B2→C1 衔接（`course/b2/`） | 2 / 3 / 4 小时 | 10 道语法题、3 篇阅读、3 组听力、1 篇写作（附参考范文）、2 轮口语（独白 + 辩论，附引发文档与考官追问）、2 项转述（médiation）、25 个词块 |
| C1 | DALF C1（预留） | — | 级别切换中显示为“即将开放” |

此外每天有按语法点的主动产出提示、间隔复习和“今日挑战”（课外真实任务）。强度只决定当天需要完成其中的多少（固定序列的前缀），超出部分可以选做。Day 41–50 的语法按学习者 Day 1–30 正确率最低的三个语法点自适应补练（打开当天即锁定），并附下一级别的衔接选做题（B1→B2、B2→C1）。

词块按“看中文和例句 → 在空格处写出法语 → 自动核对”练习：拼写（含重音、撇号、连字符）须准确，空格、大小写和标点不计；拼对记为 known，拼错或看答案记为 again。

所有作答、草稿、写作、录音都实时保存在账号中（Neon Postgres + Cloudflare R2），浏览器里不存任何学习数据。

## 结构

```
index.html          入口（只加载 app/main.js 和 app/app.css）
app/                前端（原生 ES 模块，无构建步骤）
  main.js           登录、路由、外壳（桌面侧栏 / 移动端底栏）、事件委托
  views/            今日 · 语法与主动产出 · 阅读/听力 · 写作/应用 · 口语 · 词块（拼写核对） · 间隔复习 · 错题本 · 进度 · 档案 · 路线 · 指南
  state.js          学习者状态的形状与全部修改操作
  progress.js       进度、完成度、正确率——全部由记录推导，不存储
  course.js         级别（LEVELS）与课程数据加载、每日计划（强度 → 前缀）、Day 41–50 补练选题、间隔复习序列
  store.js          载入与实时保存（差量批次、重试、多设备刷新）
  sync-core.js      状态差量算法（前端与测试共用）
  media.js          录音分段上传 / 下载（经 API 存入 R2）
  speech.js         听力的法语语音合成
  ui.js             模板、法语排版（窄不换行空格、’）、图标、格式化（瑞士时间）
  app.css           设计系统
course/             DELF B1 课程数据（唯一题库）
  course.json       50 天路线、四个阶段、强度配额、考试结构、评分维度、考试方法、拓展资源、资料来源
  grammar.json      语法点：讲解、例句、产出提示（含 B1→B2 衔接）
  questions/        每个语法点一个题库（按需加载）；Day 1–40 依次使用各题库开头的题，补练从其后继续
  days/01–50.json   每天的阅读、听力、写作、口语、应用题目，语法题 ID，45 个词块
  b2/               DELF B2 课程，结构相同（course.json · grammar.json · questions/ · days/），含 B2→C1 衔接
fonts/              自托管字体（EB Garamond、Plus Jakarta Sans，OFL）
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
| `lexicon` | `"<天>:<词块>"` = known / again（拼写核对结果；早期为自评） | `lexicon_marks` |
| `review` | `"<天>:<g\|v>:<来源天>:<题或词块>"` = 当天完成的复习项 | `review_answers` |
| `remedial` | Day 41–50 锁定的补练语法点 | `study_state.doc` |

每条记录是一行，按 `(user_id, course, key)` 存储，行级安全按用户隔离。保存是差量的：每次修改在 60–300 ms 内只发送变化的行；重放同一批次不会改变数据。服务器上以其他键存储的列表行（例如数据迁移改写过的行）会在下次保存时原地改名，不会重复或丢失。

完成度从记录推导：阅读 / 听力的一篇在所有题都作答后完成；写作、应用、口语在有提交后完成；词块在自评后完成；一天在当前强度下的所有模块都完成后完成。

间隔复习：第 d 天复习第 d−1、d−3、d−7、d−14、d−21、d−30、d−45 天的语法题与词块（由近及远、交替出现），序列由课程数据确定，不随作答变化。

## 检查

```bash
node scripts/verify.js        # 两门课程的数据（逐天逐项）、每日计划、进度引擎、状态操作、拼写核对、法语排版、模块图
node scripts/check-course.js course/b2   # 单独校验一门课程
node scripts/verify-cloud.js  # 单元 + API（真实 PostgreSQL）+ 浏览器端到端（Chromium）
```

`verify-cloud.js` 需要一个可清空的数据库（`TEST_DATABASE_URL`，Neon 测试分支或本地 PostgreSQL）和测试依赖 `npm i --no-save pg playwright`（浏览器部分从 `NODE_PATH` 解析 Playwright）。它在测试库中建立 Neon Auth 与 R2 的模拟服务，用 `delf50_api` 角色运行真实的 API，并在 Chromium 中跑完整的学习流程。

`scripts/smoke-live.js` 对真实的 Neon Auth / 数据库 / R2 做冒烟测试（使用测试分支）。

## 部署

Vercel（fra1）：静态文件 + `api/v1.js`。环境变量：`DATABASE_URL`（`delf50_api` 角色）、`NEON_AUTH_BASE_URL`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`。数据库结构变更：`DATABASE_URL=<owner> node scripts/db-migrate.js`。

`vercel.json` 设置内容安全策略和缓存：`app/`、`course/` 每次重新验证（ETag），字体长期缓存。

## 多级别

存储层按课程划分（`?course=`，默认 `delf-b1`）；前端地址带级别（`#/b1/…`、`#/b2/…`，不带级别的旧链接打开 B1），登录后打开地址中的级别，否则打开最近学习的级别。见 [docs/multi-level-architecture.md](docs/multi-level-architecture.md)。

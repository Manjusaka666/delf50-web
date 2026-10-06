# 多级别（B1 → B2 / C1 / C2）数据存储架构

当前网站只有 DELF B1 内容，但存储层已经按「多课程」设计并上线（迁移 `0004_courses.sql`）。以后加入 B2、C1、C2 时，**不需要改数据库结构，也不需要搬迁已有数据**。本文说明设计、已落地的部分，以及新增级别时的步骤。

## 1. 核心概念

```
Neon Auth 账号（一人一个，跨所有级别）
 └── 课程 course（一个级别一门课）  delf-b1 · delf-b2 · dalf-c1 · dalf-c2
      ├── 学习状态 study_state（当前天、强度等设置；rev）
      ├── 学习记录（答题、语法、主动产出、写作、应用、口语、错题、草稿、练习计数）
      └── 录音（R2：u/<user>/<course>/speaking/<clip>）
 └── 词汇本（跨课程，一份）            vocabulary_items（带 CEFR 级别）+ user_vocabulary + vocabulary_reviews
```

* **课程 ID**：`<考试>-<级别>`，小写。B1、B2 是 DELF，C1、C2 是 DALF：`delf-b1`、`delf-b2`、`dalf-c1`、`dalf-c2`。
* **一个账号可以同时学多个级别**，各级别的 50 天计划、进度、错题和历史互不影响。
* **词汇跨级别共享**：B1 学会的词到 B2 仍然算学过；每个词记录 CEFR 级别（`vocabulary_items.cefr_level`）以及它是在哪门课加入的（`user_vocabulary.course`）。

## 2. 数据模型（已上线）

所有按课程划分的表都有 `course text not null default 'delf-b1'`，并且 **course 是主键的一部分**：

| 表 | 主键 |
|---|---|
| `study_state` | (user_id, **course**) |
| `reading_answers` / `listening_answers` | (user_id, **course**, answer_key) |
| `grammar_attempts`（只追加） | id；最新行索引 (user_id, **course**, answer_key, id desc) |
| `grammar_productions` | (user_id, **course**, prod_key) |
| `writing_submissions` / `application_submissions` / `speaking_attempts` / `error_items` | (user_id, **course**, item_key) |
| `drafts` | (user_id, **course**, kind, draft_key) |
| `practice_counters` | (user_id, **course**, day_key) |
| `media_objects` | (user_id, **course**, clip_id)；R2 键 `u/<user>/<course>/speaking/<clip>.<ext>` |
| `vocabulary_items` | 共享词典，新增 `cefr_level`（A1–C2） |
| `user_vocabulary` / `vocabulary_reviews` | 跨课程；新增 `course` 记录来源 |
| 视图 `daily_activity` | 新增 `course` 列：每人、每天、每门课、每个模块的活动量 |

为什么把 course 放进主键，而不是给内容 ID 加前缀：

1. **内容 ID 可以跨级别重复**（`present-01`、`R01-1`、Day 1–50 在 B2 里也会出现），不需要改写任何题库。
2. **现有 B1 内容和代码完全不变**：列有默认值，未带 course 的请求等同于 `delf-b1`。
3. 按课程查询、统计、导出和删除都只需要一个条件 `course = …`，而且走主键索引。

行级安全（RLS）不变：仍按 `user_id = delf50.uid()` 隔离，course 只是账号内部的划分。

## 3. API 约定（已上线）

* 所有学习接口接受 `?course=<id>`：`bootstrap`、`sync`、`rev`、`media*`。**不带时就是 `delf-b1`**，现在的网站和旧缓存的客户端都不受影响。
* 未注册的课程返回 `400 unknown_course`。注册表在 `api/_lib/courses.js`：新增级别只需加一行。
* `GET /api/v1/courses` → `{courses: [可用课程], enrolled: [{course, rev, updatedAt}]}`：列出账号已开始的课程，未来的「级别切换」和 App 首页可以直接用。
* 词汇：`POST vocab {…, level}` 记录 CEFR 级别；`GET vocab?level=B2` 按级别筛选；加入时的课程自动记入 `course`。

## 4. 客户端（已上线）

`app/api.js` 把当前课程（`delf-b1`）附加到每个学习请求上（Neon Auth 的请求不附加）。加载、实时保存、多设备刷新、录音上传都按课程进行，内存中的应用状态也只属于当前课程。

## 5. 新增一个级别的步骤（以 B2 为例）

1. **内容**：B2 的课程数据照 `course/` 的结构编写（例如 `courses/delf-b2/course.json`、`grammar.json`、`days/NN.json`），用 `scripts/check-course.js` 校验。内容 ID 在 B2 内部唯一即可，不必避开 B1。
2. **前端**：`app/course.js` 的数据路径和 `app/api.js` 的课程 ID 按所选课程取值（可以按路径区分，例如 `/b2/`，也可以做级别切换）。
3. **注册**：在 `api/_lib/courses.js` 加一行 `'delf-b2': { level: 'B2', exam: 'DELF', days: …, title: … }`。
4. **新题型**：如果 B2 应用写入了 B1 没有的记录类型（例如 S 中新增的一个字段），在 `api/_lib/records.js` 的 `COLLECTIONS` 里加一项，并新建迁移创建对应的表（同样带 `course`，主键含 course）。已有的 B1 表不受影响。
5. **验证**：`scripts/verify-cloud.js` 已包含跨课程隔离测试（同一账号、同样的题目 ID、同样的录音 ID 在两门课中互不干扰）；为新课程加上它自己的往返测试，并在 Vercel Sandbox 中对 Neon 测试分支运行。

**不需要**：修改已有表结构、迁移已有数据、改动 B1 内容，或者新建账号。

## 6. 以后可以扩展的方向（按需再做）

* **跨级别进度看板**：直接用 `daily_activity` 按 `course` 汇总，或者建一个按课程的物化视图。
* **语法点跨级别衔接**：若 B2 复用 B1 的语法点 ID（例如 `subjonctif`），`grammar_attempts.node_id` 可以跨课程统计掌握度；新的高级语法点另起 ID 即可。
* **分级词表**：`vocabulary_items.cefr_level` 已就位，可以批量导入官方分级词表，把「词块」练习升级为逐词记录（接口 `vocab` 已支持 SM-2 复习）。
* **课程级设置**：强度、考试日期等放在各课程的 `study_state.doc` 中，天然按课程隔离。

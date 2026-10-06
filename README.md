# DELF50 Web

A1+ → DELF B1 的 50 天网页备考训练系统。

## 当前生产版本

- App：`1.9.0`
- State Schema：`2`
- Teaching Content：`1.9.0`
- 生产地址：`https://delf50-mvp.vercel.app`
- 路由：`source-driven-v1`
- 版本单一来源：`release-meta.js`
- 题库质量：`corpus-authored-v1`
- Bundle 来源：`deployment-local-v1`（不再运行时抓取 GitHub）
- 逐篇撰写材料：Day 4–50 全覆盖，共 376 篇（阅读 188 / 听力 188），1 368 道题
- 权威来源族：`18` · Source seeds：`180`

## V1.9.0 · 两处根本性修改

### 1. Bundle 不再依赖 GitHub

此前 `api/source.js` 每次冷启动都要向 `raw.githubusercontent.com` 取 26 个文件，并向 `api.github.com` 请求一次目录列表来装配 seeds。这意味着每一次页面加载都取决于 GitHub 可用性、取决于未认证 GitHub API 每小时 60 次的额度（Vercel 出口 IP 共享该额度），也取决于手工维护的一串 commit SHA——其中至少有一个 SHA 已不在任何分支上。任何一环失败，整个交互层不启动，用户只看到静态兜底页。

现在 `scripts/build-bundle.js` 从仓库文件生成 `build/bundle-parts.js`：13 段成品（发布信息、seeds、全部层，含 v202/v203 均已拼装好），随部署一起发布；`api/source.js` 原样提供，`scripts/verify.js` 启动的也是同一份成品。对浏览器的接口契约完全不变（仍是 `/api/source?i=0..12`，同样的执行顺序），因此已缓存旧 `index.html` 的浏览器不受影响。页面加载不再触达任何第三方主机。

**改动内容后必须重新构建**：`node scripts/build-bundle.js`。`scripts/verify.js` 会先检查 `build/bundle-parts.js` 是否与源文件一致，不一致直接失败。

### 2. 学习材料改为逐篇撰写（Day 4–20）

`v199-authentic-materials.js` 已移出加载链，文件已从仓库删除（与未被加载的 v14、v185 文件一起清理）。它用 26 条共享的四段骨架（情况 → 变化 → 细节 → 决定）改写了 Day 5–50 的全部 368 篇材料，后果是：所有材料共用同一修辞结构；每天的第 4 篇阅读与第 1 篇听力必然使用同一素材（46/46 天）；每题正确项都是正文对应位置那句话的逐字复制，干扰项来自全库共用的 6 条固定错误项——学习者不理解法语也能按位置答对全部题目。

取而代之的是 `content/corpus-v200*.js` + `v200-corpus-materials.js`：

- Day 4–20 的阅读与听力共 136 篇，逐篇独立撰写，无共享骨架。
- 干扰项逐题从本篇正文提取，改动条件、主体或时间；不存在跨篇共用的干扰项。
- 正确项不是正文语句的逐字复制；题型按篇轮换（主旨、细节、因果、数值推算、态度、前后对比）。
- 同一天的阅读与听力主题域强制互斥，装载前校验，不合格条目不写入题库。
- 篇幅随课程递增，实测均值（阅读 / 听力）：

| 阶段 | 阅读 | 听力 |
| --- | ---: | ---: |
| Day 4–8 | 100 词 | 89 词 |
| Day 9–14 | 125 词 | 117 词 |
| Day 15–20 | 152 词 | 140 词 |
| Day 21–25 | 184 词 | 171 词 |
| Day 26–30 | 191 词 | 166 词 |
| Day 31–35 | 204 词 | 172 词 |
| Day 36–40 | 211 词 | 184 词 |
| Day 41–45 | 227 词 | 190 词 |
| Day 46–50 | 230 词 | 197 词 |

  Day 4–20 每篇 3 道题，Day 21 起每篇 4 道题。Day 41 之后的多篇材料在隐含义与论证结构上已按 B2 的要求书写，用于「有余力衔接 B2」。
- 语法与功能负载逐日对齐 `content/curriculum-v17.json`，从 Day 4 的介词与 depuis/pendant 一直到 Day 50 的考后迁移；Day 31–40 覆盖 DELF 四项分技能，Day 41–49 为模考与针对性回炉。
- Day 4–50 的阅读与听力四个槽位**全部**为逐篇撰写，无生成式产出残留；`scripts/verify.js` 的覆盖行会报出 `0 slot(s) still generator-produced`。
- 375 个互不相同的题材域、254 种体裁标注、17 个公开来源。

### 关于「使用公开专业材料」

DELF 历年真题正文与新闻正文受版权保护，不能逐字收录；把自编情境挂在具体新闻 URL 下冒充来源，比不标来源更糟。本轮的做法是：每篇材料标注一个真实、可点击的公开来源（`service-public.fr`、`ameli.fr`、ADEME、INSEE、CNIL、ANSES、Météo-France、France Travail 等，多数为 Licence Ouverte / Etalab 2.0），课文按该来源的体裁、语域与事实撰写，并在学生界面直接显示来源链接——此前来源只存在于后台 provenance，学习者根本看不到。听力页另附 RFI *Journal en français facile* 与 TV5MONDE 的真实音频入口，因为应用内音频是浏览器语音合成，不等同于真实录音。

## 学习记录保护

这是本项目的硬约束：部署到同一地址后，任何浏览器中已完成的学习内容必须原样保留。

- 状态键 `delf50_v12_state` 与 Schema 2 未变，迁移仍然只增不减。
- **题目内容只由 Content ID 决定，与学习者是否作答无关。** 题库在每次启动时由各层重新生成，从不存储；学习者第一次打开一篇材料时它必然还没有作答记录，答案下标就是对着这份内容存的。因此 v178/v188/v189/v200/v202 的内容改写对每个条目无条件执行，不再按答题记录、完成标记、每日计数、写作记录或草稿「冻结」——那种冻结会让下一次启动把已作答的材料换回上一层的旧稿（学习者从未见过的旧题），已存答案指向另一组选项。槽位分配（`assignments172`、`replacements177`）是持久化状态，仍按作答记录保持不变。装载层不写入 `S` 的任何字段，装载前后对全部学习证据做快照比对，不一致则回滚。
- `scripts/verify.js` 以全新学习者、夹具学习者、作答过全部题目的学习者三种状态启动，断言全部 3646 篇材料与语法题逐字节一致；任何一层再让内容依赖学习记录，这项检查就会失败。

## 验证

```bash
node scripts/build-bundle.js          # 生成 build/bundle-parts.js
NODE_PATH=<jsdom 所在目录> node scripts/verify.js
```

`scripts/verify.js` 在 jsdom 中真实启动整个 bundle，并覆盖两类断言：

**学习记录**——以「Day 1–3 全部完成、Day 4–8 语法完成、Day 4 阅读 3 篇 + 听力 1 篇完成」的状态启动，逐项断言每日完成计数、每条答题记录、累计计数器、`startedAt`、语法产出记录与草稿全部未减少；断言已作答文档被冻结而非改写；并额外验证缺失 `assignments172` 的浏览器不会被派发到 Day 1 的旧材料。

**内容质量**——直接向应用索取 `currentReading()` / `currentListening()` 实际返回的文档（而不是假定某个 ID 世代），据此断言：任意两篇 3-gram Jaccard 相似度低于 0.35、标题互不相同、题干不重复、同一天阅读与听力相似度低于 0.30、正确项不是正文语句的逐字复制、干扰项不跨篇共用、正文不含开发端编号、篇幅随课程递增、每题答案下标有效且有解析。当前 Day 4–50 全部通过：阅读峰值相似度 3%，听力 4%，同日跨模态 2%（旧生成层为 47%–100%，且 46/46 天存在跨模态同素材复用）。

## V1.8.1 source-driven 题库

Day 3–50 按 8 小时最高强度可分配 864 个 source-driven 槽位：

| 模块 | 每日最高量 | Day 3–50 槽位 |
| --- | ---: | ---: |
| 阅读 | 4 篇 | 192 |
| 听力 | 4 组 | 192 |
| 写作 | 2 项 | 96 |
| 口语 | 4 轮 | 192 |
| 应用 | 4 项 | 192 |
| 合计 | 18 | 864 |

V1.8.1 使用按 `Day + slot` 固定生成的 Content ID（`r181-* / l181-* / w181-* / s181-* / a181-*`）。来源 seed、来源族、权威机构、来源 URL、许可、核验时间、能力功能和 semantic fingerprint 都写入 provenance，便于之后追踪与审计。

180 个 seed 来自 18 个权威来源族，每个来源族固定 10 个 seed。`scripts/build-bundle.js` 构建时强制检查：来源族数量必须为 18、每族必须为 10、总 seed 必须为 180、family ID / seed ID / 核心事实不得重复；任何一项不满足时构建直接失败，不完整的题库不会进入部署。

## V1.9.6 · 存储准确性与性能

- **只打开页面不再写云端**：此前每次启动都会刷新 8 个审计/路由时间戳，并把所有已完成内容的 `lastCompletedAt` 改成当前时间（学到第 40 天时约 226 行），每次打开页面就是一次约 30 KB 的写入。现在无变化即无写入。
- **作答一次只同步实际变化**：v172 的 `save` 包装每次保存都重新回填并重盖全部完成记录；回填改为只补缺失项，一次作答从约 228 行、52 KB 降到 2 行、约 300 字节。
- **`lastSavedAt` / `lastActiveAt` 名副其实**：只在内容真正变化时更新。
- **版本号唯一来源**：此前 19 个层各自把 `S.version`、`meta172.appVersion` 写成自己的旧版本号（线上状态记录为 1.8.2），现在只由最后一层 `v203-release-state.js` 按 `release-meta.js` 写入；无人读取的层标签、审计结果与启动时间戳从学习状态中移除（仍可在 `globalThis.__DELF50_*` 诊断对象中查看）。
- **路由不再来回翻转**：v177 在每次保存时都重新路由，把未完成槽位改成 177 代，下次打开又被 v181 改回 181 代；写作/口语/应用的两代是不同任务，学生看到的任务会在操作后突然改变。现在路由只在启动时确定。
- **删除无作用的层**：逐层移除实验（比较全部题目、各页面渲染、启动及作答后的状态）证明 `v175-day-content-routing.js`、`v176-day2-reading-repair.js`、`v180-finalize.js`、`v187-curriculum-aligned-reading.js` 对学习者可见的任何结果都没有影响，已删除。
- **学习页面不再显示开发诊断**：进度页的「学习材料校验」「兼容与升级保护」卡片（后者还误报「Content ID 需检查 · 5 重复」）与今日计划卡上的「Schema · Content」已移除；诊断数据仍可在 `window.DELF50_ARCH`、`__DELF50_CORPUS_AUDIT`、`DELF50_FULL_AUDIT` 中查看。
- **诊断不再改路由**：v178 的全量审计取分配时调用了会改写路由的 `reconcile`，每次打开进度页都会把 234 个未完成槽位改回 177 代；审计改为只读。
- **启动更快**：v200 每次启动都在浏览器里对全部 768 篇语料两两计算相似度（约 29 万次），该检查移到 `scripts/verify.js`；启动约 1.9 s → 0.9 s，每次保存约 19 ms → 5 ms（Chromium 实测）。

## 历史学习记录保护

V1.8.1 保持 Schema 2 的 additive migration 原则。

- `S.assignments172` 继续保存每个 Day 已经确定的 reading / listening / writing / speaking / application Content ID。
- 已完成数量继续从当天 `S.daily` 判断；已完成槽位不会重新分配。
- 阅读/听力只要已有逐题 answer key，即视为已有学习证据并锁定。
- 写作/应用已有提交记录或草稿时锁定。
- 口语已有对应 Content ID 的记录时锁定。
- 提高学习强度只增加尚未开始的新槽位，不删除已经完成的额外训练。
- `localStorage`、IndexedDB 录音、历史答案、完成数量、草稿和正文不因 V1.8.1 升级被清空或覆盖。

因此，从 V1.8.0 升级到 V1.8.1 后，之前 Day 1、Day 2 或任何已经开始的 Day 仍保留原学习证据；新的 source-driven 材料主要接管 Day 3–50 中尚未开始的任务。

## 去重与容量审计

V1.8 系列继续执行 `v178-full-question-audit.js` 和高强度容量审计。V1.8.1 source-driven 生成层在本地审计中验证了 864 个槽位可分配，并对以下维度进行重复检查：

- Content ID；
- 阅读全文和听力脚本；
- 写作、口语、应用任务文本；
- 阅读与听力每一道小题题干；
- semantic fingerprint。

V1.8.1 接线前的审计结果为上述重复项均为 0。既有历史任务和新生成任务分开处理：历史证据优先锁定，新题库只填充未开始槽位。

## Day 3 重复材料修复

早期版本中 Day 3 与 Day 1 出现重复的历史材料仍按照“保留证据、追加纠偏”的原则处理。已经完成的重复阅读不删除旧答案和完成记录；尚未开始的槽位可以被 V1.8.1 source-driven 内容安全替换。若槽位已经产生真实作答、草稿或录音，则继续锁定旧 Content ID，不强行换题。

## 8 小时 × 50 天容量

8 小时档的 50 天核心需求为：

| 模块 | 每日最高量 | 50 天最低容量要求 | 当前容量 |
| --- | ---: | ---: | ---: |
| 语法客观题 | 12 | 600 | ≥650；保守测试 817 |
| 阅读 | 4 篇 | 200 | V1.8 基础容量 + V1.8.1 source-driven Day 3–50 |
| 听力 | 4 组 | 200 | V1.8 基础容量 + V1.8.1 source-driven Day 3–50 |
| 写作 | 2 项 | 100 | V1.8 基础容量 + V1.8.1 source-driven Day 3–50 |
| 口语 | 4 轮 | 200 | V1.8 基础容量 + V1.8.1 source-driven Day 3–50 |
| 应用 | 4 项 | 200 | V1.8 基础容量 + V1.8.1 source-driven Day 3–50 |

语法扩容仍由 `v180-authoritative-volume.js` 提供；新增题只追加在旧题之后，旧题顺序和旧 Trace ID 不改。

## 权威来源与版权边界

课程与题型校准使用 France Éducation international DELF B1 官方考试结构、样题和备考说明，以及 Council of Europe CEFR descriptors。官方样题仅用于题型、时长、评分和难度校准，不批量复制官方真题文本。

V1.8.1 的 source seeds 使用法国公共服务、就业、教育、医疗、交通、能源、统计、数据保护、网络安全和文化等权威公共信息来源。系统使用这些来源提供事实类型、现实场景和词汇方向，再生成 DELF50 原创训练文本；运行时 provenance 保留来源 URL、authority、licence 与 verifiedAt。

## 50 天路线

- Day 1–18：基础与语法自动化。
- Day 19–30：应用迁移。
- Day 31–40：DELF B1 四项专项。
- Day 41–50：模拟、错误修复和稳定性训练。

## 每日强度

- 5 小时：语法 8 + 主动产出 6；应用 2；听力 2；阅读 2；写作 1；口语 2。
- 6.5 小时：语法 10 + 主动产出 8；应用 3；听力 3；阅读 3；写作 1；口语 3。
- 8 小时：语法 12 + 主动产出 10；应用 4；听力 4；阅读 4；写作 2；口语 4。

## 数据保护

学习状态保存于浏览器 `localStorage`；口语录音保存在 IndexedDB `delf50_audio_v1`。Schema 2 坚持 additive migration。历史答案、完成数量、写作/应用正文、草稿、错题和录音引用默认只保留、不重算。JSON 备份不包含录音文件。

## V1.8.1 主要文件

- `content/seeds-v181/01-sp-housing.json` … `18-culture-access.json`
- `v181-source-driven-content.js`
- `v180-authoritative-volume.js`
- `v178-full-question-audit.js`
- `v177-global-unique-routing.js`
- `v172-compat-architecture.js`
- `v173-learning-archive.js`
- `api/source.js`
- `index.html`（loader cache key 由 `release-meta.js` 提供）
- `release-meta.js`（App / Content / Schema / Route / Input Quality 的单一版本源）
- `v198-release-ui.js`（诊断接口 `window.DELF50_ARCH` 报告当前发布版本）

## 账号与云端学习记录（Cloud v1）

使用 Neon Auth 登录后开始学习；答题、语法作答、写作、应用任务、口语记录、错题、草稿、内容完成与学习计划都作为数据库实体实时写入 Neon（通常 < 500 ms），口语录音直接存入 Cloudflare R2。浏览器不再保存任何学习数据。该层独立于现有代码，唯一改动是 `index.html` 中的一行 `<script src="/cloud/delf50-cloud.js">`。架构、数据表、RLS、API（含未来 App 使用的 Bearer JWT 与词汇 SM-2 接口）、配置与验证见 [`docs/cloud-sync-v1.md`](docs/cloud-sync-v1.md)；为 B2/C1/C2 预留的多级别存储架构见 [`docs/multi-level-architecture.md`](docs/multi-level-architecture.md)。

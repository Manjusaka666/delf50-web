# 难度复审（第二轮修复之后）：B1 / B2 练习是否真正达到官方水平

对象：`docs/difficulty-audit-pr24.md` 第 6 节的 P0–P3 缺陷，以及 `docs/difficulty-fixes-round2.md` 的自述。基线提交 `3c4673f`，复审时的 HEAD 为 `b099a31`（与我开始时的 `89646b2` 相比，课程 JSON、app、scripts 没有变化，只是 B2 听力录音在我审计期间被重新生成并提交）。没有修改任何课程、应用或脚本文件；统计脚本放在会话临时目录，不在仓库里。

方法：用 node 解析全部 50 天 B1（`course/days`）与 B2（`course/b2/days`）的 JSON，对 `3c4673f` 与当前版本逐题比较；再用脚本筛出可疑题，逐题全文阅读。完整阅读并核对答案的题目约 160 道（B1：R03-2、R25-3、R18-2、R35-3、R37-2、R38-2、R43-3，L10-1、L12-1、L17-1、L22-1、L24-3、L30-1、L31-1、L32-2、L49-3 等；B2：R05-1、R12-1、R44-1，L03-1、L05-2、L09-1、L19-2、L27-2、L32-1、L40-3 等），另外在上下文中核对了约 120 道被脚本标出的“干扰项文字几乎全部出现在原文同一句”的题。

## 1. 执行摘要

| 级别 · 技能 | 修复后的判断 | 把握 |
|---|---|---|
| B1 阅读 | 文本与广告网格达到官方水平。选项长度泄露已消除。**题目深度没有变深**，反而更字面：新增简答里 86% 是“多少 / 几点 / 几岁”这类数字检索，推断类题干占比比修复前还低。 | 中高 |
| B1 听力 | 长度、题量、口语性已追上官方样卷（Ex1/Ex2 约 340 词，Ex3 约 375 词，8–9 题）。但修复引入了**可核实的错键 / 同义反复的答案 / 重复题**，口语标记机械、语域有误。总体“达到官方的字数，难度不高于官方”。 | 中 |
| B1 写作 | 范文字数全部过线；回复类任务补了来信。体裁与要求与审计时相同。 | 中高 |
| B2 阅读 | **达到并略超官方**：文本比官方样卷（exemple 3）长约 20–35%（官方词数为我的估算），干扰项现在多是“原文里出现过但归因或程度错误”的内容，立场 / 释义类题干占 25–38%。 | 中高 |
| B2 听力 | 长度达标（Ex1/Ex2 中位 521 / 542 词，Ex3 每段中位 160 词）。**Ex3 的体裁仍是通知 / 公告，题目仍然字面，低于官方**；Ex1/Ex2 插入的新段落有 3 处明显的对话断裂和 1 处自相矛盾，另有约 15 组“开放题与选择题重复提问”。 | 中 |
| B2 写作 | 与审计时相同：官方水平，范文是 B2 而不是 B2+（未改）。 | 中高 |

**核心结论**：P0 中最严重的缺陷（正确选项最长，B2 阅读 93–95%）确实修好了，数据比作者自述更干净；但为了把选项“缩短”，作者改了 1,448 个正确选项，其中至少 9 处产生了意义错误、同义反复或坏法语，且新增的开放题带来了成批的**重复提问、跨题泄露**和**打分过松**。验证器全部通过，但它既不检查这些，也不检查对话连贯性，所以“全部通过”不能当作质量证明。

我没有听录音，也无法判断合成语音的自然度。B1 官方样卷我这次没能重新取回（france-education-international.fr 返回 403，delfdalf.fr 的 B1 路径 404），B1 的官方数字沿用第一次审计，没有独立核实。B2 的官方对照用的是 delfdalf.fr 镜像的 FEI “exemple 3（新格式）” 候选卷和转写稿，我读了全文。

## 2. 第一次审计缺陷清单逐项核查

状态：已修复 / 部分修复 / 未修复。数字全部是我对 50 天全部题目重算的（口径见第 3 节）。

| 优先级 | 缺陷 | 状态 | 证据 |
|---|---|---|---|
| P0 | 正确选项最长（B2 阅读 93–95%，其余 75–80%） | **已修复**，但出现替代性泄露 | 唯一最长项就是正确项：B1 阅读 Ex2/Ex3 76/80% → 25/28%，B1 听力 75–80% → 31–33%，B2 阅读 Ex1/Ex2 93/95% → 37/37%，B2 听力 76–79% → 32–33%。按“单个练习里正确项最长占比 ≥75%”统计：B1 150/238 → 7/238，B2 176/282 → 1/280。残留的问题见第 3.3 节：现在“最短”偏高（B2 听力 Ex1 41%、Ex2 39%）；“与另两项首词不同的那一项”是正确项的比例 B1 46% → 58%，B2 55% → 64%；“Parce que”句式不一致时，B2 38 题里 33 题的异类就是正确项（修复前 13 题 / 8 题）。 |
| P0 | 干扰项含绝对化词、不真实 | **部分修复** | 绝对化词在正确项 / 错误项中的占比（我的正则）：B1 阅读 1.3% / 3.0%（原 1.1 / 4.4），B1 听力 1.2 / 3.2（原 1.5 / 4.8），B2 阅读 3.0 / 4.8（原 3.2 / 5.8），B2 听力 1.1 / 1.8（原 2.7 / 7.1）。验证器口径更宽：B2 阅读 7.3% / 10.6%，仍是错误项多约 45%，只是在 ±4 个百分点的容差内。B2 阅读的原有例子（R27-1 Q2–Q4、R14-1 Q4、R14-2 Q8）已经改成“似是而非”。**但审计点名的 B2 L40-3 Q1 没有动**：“Les bus deviendront gratuits.” / “La gare routière fermera ses portes.” 仍是与文本无关的陪衬。 |
| P1 | B2 听力长度不足，Ex3 过易 | **长度已修复；Ex3 的难度只修了一半** | 全文词数中位数：B2 Ex1 389 → 521，Ex2 417 → 542，Ex3 352 → 498。Ex3 每段（按 “Document N.” 切分）中位数 113 → 160（135–207，P10 148，P90 181）。我读到的官方 exemple 3 的三段短文档约 175–190 词（含主持人引导语，我手工估算），所以长度基本持平，略短。但 Ex3 的体裁仍是“交通公告、俱乐部通知、慈善跑”，题目仍是事实题（见第 5 节）。 |
| P1 | 听力口语性弱 | **部分修复** | 每 100 词的口语标记（Euh…、自我修正“X… non, Y”、Bon/Ben/En fait/Franchement/Écoutez/Vous savez/Disons 等；我的严格口径）：B1 Ex1 0.24 → 1.05，Ex2 0.01 → 1.25，Ex3 0.01 → **0.02**；B2 Ex1 0.14 → 0.92，Ex2 0.11 → 0.69，Ex3 0.12 → 0.45。所以“约每百词 1.2 处”只对 B1 Ex1/Ex2 成立；B1 Ex3、B2 Ex3 偏低。语域也有问题（第 6 节）。 |
| P1 | 缺简答、V/F 加摘录、“用自己的话解释” | **形式已补齐，实质偏浅，打分偏松** | B1 阅读 Ex2/Ex3 每篇 5 选择 + 3 摘录 + 1 简答；B1 听力每段 +2 简答；B2 阅读 Ex1/Ex2 每篇 8 选择 + 1 摘录 + 1 简答；B2 听力 +1 简答。**但**：B1 的 400 道简答中 86% 是数字 / 时间 / 数量检索，答案中位数 3 个词；B2 阅读的 100 道简答中 73 道是“Citez deux…”式罗列，真正的 “Expliquez avec vos propres mots / Que signifie…” 只有 4 道（自述“每篇一道”不准确）；B1 的 V/F 加摘录 300 道全是原有 V/F 加了 `cite` 字段，题干没变。打分上把整篇原文粘进去，400/400 道摘录题和 645/650 道简答题都判对（`app/answers.js` 没有长度限制）。 |
| P1 | B2 格式 B 缺失 | **未做（作者已声明）** | 与官方“两种格式并行、互不占优”一致，不扣分。 |
| P2 | B1 听力偏短 | **部分修复** | 中位数：Ex1 338 → 341，Ex2 325 → 333，Ex3 309 → 375。Ex1/Ex2 基本没动，作者的理由是官方 B1 约 333–341（该数字我没有重新核实）。 |
| P2 | B1 广告网格 “Oui” 占 72% | **已修复** | 800 个标准格：72.0% → 63.8%（验证器报 64%）。改了 66 个格的答案，我抽查 11 个，文字和答案一致；50 天网格里“四项全满足”的广告都是唯一的，并与第 17 题的答案一致；例外只有 R19-1（两家都满足，题面问“保护最好”）和 R26-1（按设计无一家满足，问加一项选项后的最优），都是原有设计。 |
| P2 | 题干 / 体裁模板重复 | **题干已修；体裁未动** | B2 “Quelle est la thèse de l’auteur ?” 23 次 → 6 次，“Quel est le sujet principal de cet entretien ?” 7 → 0（现最多重复 6 次）。体裁未变：B1 Ex3 仍是 49/50 “Reportage radio”，B2 Ex3 50/50 “Trois documents courts”，B2 阅读三个练习的体裁每天相同。 |
| P2 | B1 写作无来信、B2 有 17 篇无激励 | **已修复（B1 按作者设计只补回复类）** | B1：100 篇中 24 篇带 `trigger`（19 篇朋友邮件 + 5 篇论坛），其余 76 篇（文章 22、正式邮件 14、投诉信 12、正式信函 9 等）仍无来文，这与官方 B1 的“给情境”一致。B2：33 → 49/50，剩下 1 篇是 synthèse，激励就是当天两篇阅读。抽查 W04-1、W23-2、W05-1、W16-1、W36-1、W45-1，来信与题面、范文称呼一致。 |
| P2 | B2 阅读信息密度略低 | **未做（作者已声明）** | 文本一字未改；Ex1/Ex2 中位 503 / 513 词，已高于官方 exemple 3（约 400 词级）。 |
| P3 | B2 范文只到 B2 | **未做** | 每千词虚拟式 2.3、让步结构 5.3、*dont* 0.7，与修复前完全相同。 |
| P3 | 两篇范文低于字数下限 | **已修复** | 全部 150 篇范文按空白分词 ≥ 167（B1）/ ≥ 261（B2）；按考试口径（缩合词算一个词）B1 最低 163（W25-2），B2 最低 258，余量很小。作者列的 8 篇已补足；审计指出的 B1 W25-2 没有改，但我的两种口径下它都 ≥ 163，原先的 158 应是不同口径。 |
| P3 | 难度无爬坡 | **未做（产品决定）** | 无变化。 |

## 3. 重算的指标

口径：只统计三选一的选择题（不含 V/F、简答）；“最长 / 最短”只统计长度唯一的题；“长度比”= 正确项平均长度 ÷ 错误项平均长度。验证器自己的口径略有不同（见 3.4）。

### 3.1 选项长度

| 模块 | 修复前 最长 / 最短 / 比 | 现在 最长 / 最短 / 比 | 选择题数 |
|---|---|---|---|
| B1 阅读 Ex2 | 76% / 6% / 1.28 | 25% / 39% / 0.89 | 250 |
| B1 阅读 Ex3 | 80% / 6% / 1.30 | 28% / 37% / 0.91 | 250 |
| B1 听力 Ex1 | 75% / 7% / 1.43 | 32% / 27% / 1.00 | 300 |
| B1 听力 Ex2 | 80% / 8% / 1.45 | 31% / 32% / 0.99 | 350 |
| B1 听力 Ex3 | 79% / 5% / 1.43 | 33% / 35% / 0.99 | 350 |
| B2 阅读 Ex1 | 93% / 2% / 1.57 | 37% / 37% / 1.04 | 400 |
| B2 阅读 Ex2 | 95% / 2% / 1.59 | 37% / 36% / 1.07 | 400 |
| B2 阅读 Ex3（论坛，未动） | 35% / 32% / 1.01 | 35% / 32% / 1.01 | 350 |
| B2 听力 Ex1 | 79% / 7% / 1.32 | 32% / 41% / 0.97 | 349 |
| B2 听力 Ex2 | 79% / 7% / 1.34 | 33% / 39% / 0.96 | 350 |
| B2 听力 Ex3 | 76% / 7% / 1.40 | 32% / 34% / 0.99 | 344 |

随机基线 33%。长度泄露消除。次一级的现象：正确项最短的比例在 B1 阅读（37–39%）和 B2 听力 Ex1/Ex2（41% / 39%）略高于 33%，是缩短时矫枉过正；在单个练习层面，“正确项最短占 ≥75% 的题”B1 有 12 个、B2 有 6 个。

### 3.2 绝对化词、广告网格

见第 2 节表格。网格 Oui：72.0% → 63.8%。

### 3.3 缩短之后出现的新“泄露”（作者和验证器都没有量）

| 指标 | B1 修复前 → 现在 | B2 修复前 → 现在 |
|---|---|---|
| 与另两项首词不同的那一项是正确项（随机应约 33%） | 225/492 = 46% → 336/576 = 58% | 318/577 = 55% → 415/645 = 64% |
| “Pourquoi”类题里 “Parce que…” 句式不齐，其中异类 = 正确项 | 4/7 → 11/15 | 8/13 → 33/38 |
| 含逗号 / “et” 的选项：正确 / 错误 | 8% / 1%，14% / 1% → 7% / 3%，8% / 2% | 12% / 1%，15% / 1% → 11% / 4%，12% / 3% |
| 与原文词汇重合最高的选项是正确项 | 41% → 49% | 49% → 43% |
| 正确项 ≤3 词 | 4% → 13%（196 道） | 17% → 20%（444 道） |

结论：“长”这条线索被关掉了，“句式与另外两项不同”“并列结构”“与原文词汇最接近”还在，B1 反而更明显。例子见第 4 节 B2 L27-2 Q8、L05-2 Q8。

### 3.4 验证器口径（`TELLS=1`）

```
B1 reading : longest 26% shortest 38% of 531, ratio 0.92, abs right 4.2% wrong 5.2%
B1 listening: longest 32% shortest 36% of 902, ratio 0.99, abs right 3.0% wrong 4.5%
B1 grid     : « oui » 64% of 800
B2 reading : longest 37% shortest 35% of 778, ratio 1.06, abs right 7.3% wrong 10.6%
B2 listening: longest 32% shortest 39% of 984, ratio 0.97, abs right 3.6% wrong 2.6%
```

与作者的自述一致（B2 阅读作者没报）。验证器阈值很宽：最长 ≤ 40%（基线 33%）、最短 ≤ 45%、长度比 0.87–1.15、绝对化词差 ≤ 4 个百分点。

### 3.5 文本长度与题量

| 项 | B1 修复前 → 现在（最小 / 中位 / 最大） | B2 修复前 → 现在 |
|---|---|---|
| 阅读 Ex1 | 273/293/381 → 273/297/381 | 476/503/572 → 不变 |
| 阅读 Ex2 | 352/402/432 → 不变 | 456/513/574 → 不变 |
| 阅读 Ex3 | 364/411/460 → 不变 | 236/268/312 → 不变 |
| 听力 Ex1（全文词数） | 314/338/364 → 319/341/368 | 353/389/457 → 460/521/597 |
| 听力 Ex2 | 299/325/340 → 306/333/348 | 358/417/539 → 470/542/605 |
| 听力 Ex3 | 291/309/323 → 359/375/388 | 318/352/397 → 439/498/536 |
| 每天阅读总词数中位 | 1112 → 1115 | 1287 → 1287 |
| 每天听力总词数中位 | 972 → 1049 | 1157 → 1546 |
| 录音时长（秒，每段） | 91 / 107 / 129 | 142 / 165 / 189 |

录音语速约 176–216 词 / 分钟（中位 195），与官方 exemple 3 的节奏大致相当。录音与文字稿逐段对照（300 个 json 的 `texts` 与脚本词数），没有一个偏差超过 6%；`verify.js` 全部通过。

题量 / 题型（每个练习，全部 50 天一致，括号为少数天的例外）：

| 练习 | 题数 | 选择 / 摘录 / 简答 |
|---|---|---|
| B1 阅读 Ex1 | 17 | 17 / 0 / 0（16 个网格格 + 1 道总问） |
| B1 阅读 Ex2、Ex3 | 9 | 5 / 3 / 1 |
| B1 听力 Ex1 | 8 | 6 / 0 / 2 |
| B1 听力 Ex2、Ex3 | 9 | 7 / 0 / 2 |
| B2 阅读 Ex1、Ex2 | 10 | 8 / 1 / 1 |
| B2 阅读 Ex3 | 7 | 7 / 0 / 0 |
| B2 听力 Ex1 | 8（1 天 7 题） | 7 / 0 / 1 |
| B2 听力 Ex2 | 8（2 天 7 题，2 天 9 题） | 7 / 0 / 1 |
| B2 听力 Ex3 | 8（7 天 7 题，1 天 9 题） | 约 7 / 0 / 1 |

B2 听力 Ex3 的文档标签：每道题都以 “Document N.” 开头，三段的题数为 3–4 / 2–3 / 2–3，题序按文档顺序，**每道题的引文都能在其标注的文档里找到**（0 处例外）。作者“按文档顺序”的说法成立。

### 3.6 写作

| 项 | B1 | B2 |
|---|---|---|
| 范文词数（空白分词）最小 / 中位 / 最大 | 167 / 182 / 214 | 261 / 279 / 337 |
| 低于 minWords 的范文 | 0 | 0 |
| 带 `trigger` 的题 | 24 / 100 | 49 / 50 |
| 虚拟式 / 让步 / dont（每千词） | 1.4 / 2.8 / 0.7（未变） | 2.3 / 5.3 / 0.7（未变） |

## 4. 答案键与出题错误（完整清单）

分级：A = 键有误或可被合理质疑；B = 同义反复、残缺的选项或坏法语；C = 重复提问；D = 跨题泄露；E = 打分设置。我没有发现“把正确答案改成原文里反着说的”这类致命错键，但有一个键与原文不符，一个错项同样成立。

### A. 键有误或有歧义

| 位置 | 问题与证据 |
|---|---|
| **B1 L22-1 Q5** | 题：Quel est le problème avec le plombier habituel ? 键：“Il est parti en voyage.” 脚本：“Celui avec qui je travaille d’habitude est en congé.” “en congé” 不等于“parti en voyage”。同一选项文字“Il est parti en voyage.”还是 Q3（隔壁邻居）的键，“voyage”只属于邻居。看起来是作者把 L22-1 的 “en vacances → parti en voyage” 改在了两处。另外两个干扰项（trop cher / refuse de se déplacer）很弱，所以仍可答对，但键本身不准。 |
| **B2 L27-2 Q3** | 题：Qui peut obtenir un dédommagement ? 键：“Les abonnés aux cinq retards par mois.”（不通顺）错项 C：“Les abonnés annuels.” 脚本：“Tous les abonnés mensuels ou annuels, dès lors qu’ils ont subi… au moins cinq retards”，所以 C 也是真话，只是不完整；`why` 自己写了“C 漏掉了月票用户”。可被合理选择。 |
| **B1 L10-1 Q5** | 键：“Avec un vieux mécanicien.” 脚本：“avec l’ancien mécanicien de mon père”。ancien（以前的）≠ vieux（年老的）。 |

### B. 同义反复、残缺或不通的选项 / 坏法语

| 位置 | 内容 |
|---|---|
| **B1 L24-3 Q2** | 题：Qui sont les « navetteurs » ? 键：“Des navetteurs.” 同义反复，等于没有答案。 |
| **B1 L49-2 Q2** | 题：Qu’est-ce qu’une maison de naissance ? 键：“Une maison de naissance.” 同上。 |
| **B1 L49-3 Q3** | 题：Comment le jardin est-il adapté aux malades ? 键：“Il est adapté à eux.” 空话（原文是 bacs surélevés、allées larges 等）。 |
| **B1 L04-3 Q7** | 键：“Des âgés et des jeunes.” 不是法语（应为 des personnes âgées）。 |
| **B1 L32-2 Q9** | 键：“Bon pour les petits, et les écarts réductibles.” 语义不清，无法对应“Que pense-t-elle de la possibilité d’étendre ce modèle ?” |
| **B1 L17-3 Q9** | 键：“Ils rouvrent des caisses « bavardes ».” 引号里的 « bavardes » 脚本里没有（原文是 « caisses lentes »，“où l’on prend le temps de discuter”）。 |
| **B2 L20-2 Q7** | 键：“Sans recharge à domicile.” 题干是“Pour qui…”，选项不是名词短语。 |
| **B2 L03-1 Q5** | 题干没有主语（Qu’a révélé l’exercice…），键“Beaucoup étaient fausses ou déformées.”的“étaient”没有先行词；还与开放题 Q4 同问一件事。 |
| **B2 L27-2 Q8** | 题：Pourquoi… conseille-t-il de rester courtois ? 键：“Un message clair et poli aide.” 另两项都是 “Parce que…”，唯独键不是（句式泄露）。B2 L05-2 Q8 同样（键“Il faut quitter des maisons de famille.”，另两项 “Parce que…”）。 |
| **B1 L12-1 Q4** 等 | 极简键如“Il a disparu.”“Pas longtemps.”“Fatigue et peur.”“Le soir, c’est trop long.”（L25-3 Q7）在语义上可接受，但与官方的完整短语相比偏口语电报体；B1 听力正确项平均只有 5.8 词。不列为错误，只提示。 |

### C. 开放题与选择题重复提问（验证器只查选择题之间）

完全重复或开放题答案被同一道选择题的键直接给出：

- B2：L03-1 Q4/Q5（six / 一共二十个例子）、L05-2 Q4/Q5（“Pourquoi les copropriétaires…indemnisés”问了两次，Q4 键“L’érosion n’est pas une catastrophe naturelle”正是 Q5 的 accept）、L09-1 Q4/Q5（题干几乎逐字相同）、L13-1 Q4/Q5、L19-2 Q2/Q3（météo / climat）、L23-2 Q4/Q5、L25-1 Q3/Q4、L27-2 Q2/Q3、L34-1 Q4/Q5（parking + navette）、L39-1 Q6/Q7（service commun / comptabilité）、L42-2 Q4/Q7（espérer / souhaiter）、L46-1 Q4/Q5（isolement / solitude）、R01-2 Q8/Q9（Q8 键含“sans voyager”，即 Q9 的 accept 之一）。
- B1：L15-1 Q1/Q2、L45-1 Q6/Q7（部分重叠，提示性泄露）。

共约 15 组确认的重复。作者说用新校验“按此删去了 10 道重复题”，但该校验只比较有 `options` 的非摘录题，新增的开放题不在内。

### D. 跨题泄露（一道题的题干 / 选项直接给出另一道开放题的答案）

B1：R25-3 Q5（答案 « couleurs » 已在 Q2 题干“l’avantage des couleurs”里）；L03-1 Q5（答案 douze 是 Q4 的选项“Douze euros”）；L18-1 Q2（答案 vendredi 在 Q4 题干）；L36-3 Q1（答案 huit 在 Q2 题干“ces huit femmes”）；L37-1 Q6（答案 mercredi 在 Q7 题干）；L01-3 Q3（答案 quarante 是 Q2 的一个选项）。
B2：L39-1 Q6（Q7 题干和键同时含 service commun / comptabilité）、L11-2 Q5（accept 之一 bienvenue 在 Q8 题干）、R37-2 Q9（Q8 键“Partager les bénéfices…”就是 Q9 的一个要点）、L34-2 Q3（carnet 在 Q2 题干）、L49-1 Q5（hiver 在 Q7 题干）。

### E. 打分设置（`accept` 与 `app/answers.js`）

- **过严（逐字抄原文被判错）**：B1 R35-3 Q5（“Six demandes sur dix…”→ 错；只收 “six sur dix / 60”）、R37-2 Q3（原文“un Français sur six”→ 错，只收 “un sur six”；“Un tiers”“17 %”类同）、R38-2 Q4 与 R43-3 Q4（原文“un salarié sur trois”→ 错，“Un tiers”也错，只收 “un sur trois”）。我用 `isCorrect` 实测确认。
- **过松（常见单词即得分）**：B1 R06-3 Q3（budget / argent / cout / prix 任一词即对“第一大原因”）、R10-3 Q7（“jeunes / sympathiques”）、R04-3 Q9（“cher / coute”）；B2 L14-3 Q5（“enfants / jouer”）、L48-2 Q4（“parent / famille / eloigne”）、L19-2 Q3（“jour”“moyenne”）、R08-2 Q7（“cout / cher / temps / cours”各算一项）。共约 11 题可凭一两个常见词过关。
- **整段粘贴**：见第 2 节 P1，400/400 摘录、645/650 简答被粘贴原文判对。

### F. 我核对后认为没有问题的

B2 R05-1、R12-1、R44-1 逐题键、V/F 加摘录的判断与引文、干扰项都成立；B1 R18-2、R25-3、L31-1（含自我修正的数字）、L30-1、L17-1 的键成立；17 个网格总问与格子答案一致；所有 `cite` 引文（400）逐字出现在原文，所有开放题的 `model` 都满足自己的 `accept`，没有一个 `accept` 元素出现在自己题干里；所有 `why` 中的引文 4,881 处只有 3 处找不到（含省略号）。自我修正（184 处“X… non, Y”）没有一处使键落在被更正的错误数字上。作者列的 6 处错改都已改正。

## 5. 与官方 DELF B1 / B2 的难度对照

官方对照（B2，FEI “exemple 3” 新格式，我读了全文）：听力 Ex1 约 480 词、Ex2 约 520 词，各 7 题；Ex3 三段各约 175–190 词（含主持人引导），共 6 题，只听一遍。每道题 3 个短选项（如“les nouveaux types de magazine vont… A encourager l’écriture / B promouvoir la lecture / C favoriser la réflexion sur l’actualité”）。阅读 Ex1 约 400 词（估算），7 题，如“Les parents seraient… très opposés / plutôt partagés / globalement favorables”，Ex3 是三人论坛配对。写作：给市长写信反对一项决定，≥250 词。

### B1

- **阅读**：文本和网格保持官方水平（见第一次审计）。问题在题目深度：用题干启发式粗分，B1 Ex2 推断 / 立场类题干占比 10% → 7%，Ex3 17% → 11%（因为 3 道 V/F 变成摘录题，另加了 1 道取数简答）。例：R25-3 Q3 “Avec l’ancien système, certains élèves en difficulté avaient renoncé à rendre leur travail.” 摘录 “certains ne rendaient même plus leurs copies”；Q7 “…évaluer par compétences est plus rapide que mettre une note” 摘录 “demande beaucoup plus de temps que de mettre une note”——都是同义改写后的一句话对一句话。官方 B1 样卷的这类题至少需要综合两句。
- **听力**：长度和题量达到官方。简答 100 道 / 练习（B1 共 300 道听力简答）里数字、时间、年龄占绝大多数，例如 L02-1 Q5 “Quel âge a le chien de la voisine ?”、L04-3 Q5 “Combien de places compte le minibus ?”，这是官方 B1 简答里最容易的一档。选择题的干扰项有改进（“lifted”干扰项如 L30-1 Q6 “Certains sont cassés / Ils sont cassés / Ils sont intacts”），也有一批退步成电报式短语或同义反复（第 4 节 A/B）。口语性：对话类脚本“Bon, … / Ben, … / Franchement, … / Euh…”高度套路化（全部 300 个听力脚本里，“Bon,” 148 次，“En fait,” 97 次，“Franchement,” 92 次，“Euh…” 95 次，其中 94 次后接小写字母，是同一种位置的机械插入）。L31-1、L17-1 的自我修正和对话读起来自然。
- **判断**：B1 阅读 ≈ 官方（文本）/ ≤ 官方（题深）；B1 听力 ≈ 官方的篇幅与题量，难度**不高于**官方；整体“达到官方水平”可以说，“略超”不成立。

### B2

- **阅读**：达到并略超。例：R05-1 Q4 的 V/F 加摘录“Les cultures absorbent moins d’eau que tous les autres usages additionnés.”要求把“près de 60 %”与“eau potable、centrales、industrie”相加后判断（Faux），官方 exemple 3 同类题没有这个运算；R05-1 Q6 “On socialise le coût et on privatise la ressource”的含义、Q10 “Il n’existe pas de solution technique à un problème de partage”的结论；R12-1 Q3 的干扰项“Les sondages ne peuvent pas refléter la population par l’âge, le sexe et la région”直接取自原文对象（是 convention 成员的抽样原则）却被归到错误对象，是官方式的“似是而非”。R44-1 Q4 “Environ un quart, comme pour les emballages en France”同理。B2 阅读推断 / 立场类题干占 25–38%（官方 exemple 3 的阅读题多是改写后的细节题，例如 “Les parents seraient… plutôt partagés”）。仍有的短板：B2 Ex3 论坛 268 词比官方约 330 词短，选项仍是“谁说的”式配对。
- **听力 Ex1/Ex2**：长度和口语化到了官方水平，题目是主旨、立场、让步、数字、含义（如 L09-1 Q7、L19-2 Q6）。但新增的“额外一段”大多只是在末尾加长（L09-1 的 seg5 整段不对应任何题，只增加了字数），而且伴随着第 6 节的断裂。
- **听力 Ex3**：长度（160 词）接近官方，**体裁和题目没有追上**：官方 exemple 3 的三段是两位专家的观点（presse jeunesse、jeux de société、robots émotionnels），题问“作者认为… 会促进…”；课程里 50 天几乎都是“公交调整、俱乐部通知、慈善跑、回电话留言、报名公告”这一类，题目是“Qu’est-ce qui change à partir du 2 septembre ?”“Que risquent les joueurs…”。L40-3 Q1 的“Les bus deviendront gratuits.”“La gare routière fermera ses portes.”仍是 A2 水平的陪衬项，与第一次审计的批评一字不差。
- **写作**：未改，达到官方；范文在 B2 档。
- **判断**：B2 阅读 **略超官方**；B2 听力 Ex1/Ex2 **≈ 官方**；Ex3 **低于官方**；B2 写作 ≈ 官方。

## 6. 回归问题

### 6.1 不连贯的插入（脚本里新增的段落）

| 位置 | 问题 |
|---|---|
| **B2 L32-1** | “— Marc Delorme, un mot pour conclure ?” 之后紧跟新插入的 “— Marc Delorme, que pensez-vous des expériences menées à l’étranger ?”，“un mot pour conclure”这个问题从来没有被回答；下一段 Marc Delorme 又说 “Je suis tout à fait d’accord avec cette dernière phrase”，而那句话（“Accompagnée, plutôt…”）正是他自己前一段说的，读起来像自己同意自己。Q8（Comment… conclut-il ?）的键只能靠最后一句。 |
| **B2 L47-1** | “— Camille Bertin, un mot pour conclure ?” 回答后，又插入一组问答 “— Pour les spectateurs, que changerait une interdiction ?”，被访者的回答里嵌着主持人的提问（“…période d’adaptation. Bruno Messin, vous avez déjà supprimé certains numéros, je crois ?”），最后才是 “— Merci à tous les deux.”。 |
| **B2 L27-2** | 同一采访里“voyageurs occasionnels”被问两次：seg1 说临时乘客“只有整班取消才能退款”，seg5 说临时乘客在“晚点超过一小时或错过换乘”时可以退款，互相矛盾；seg4 新增的 “En fait, il lui serait toutefois reproché de ne pas nous avoir écrit d’abord” 句子无主语指代，法语不通。Q3 键的 `why`（“A 错：偶尔乘客只有取消才赔”）因此不再成立。 |
| **B2 L19-2** | 新插入的主持人提问 “— Ces faits locaux suffisent-ils à convaincre ?” 出现在“faits locaux”首次被提到（后一段 “Ce sont des faits locaux, mesurés par la même station”）之前，先行词颠倒。 |
| **B2 L09-1** | 新段落又问一次 “Les patients suivent-ils vraiment ces prescriptions sur la durée ?” 且答 “C’est la grande question.”，而前面已经问过“vos patients suivent-ils vraiment vos conseils ?”并答“C’est toute la question.” 整段（约 130 词）不对应任何题，只用于加长。同类的重复主持人提问还有 L04-2、L30-1、L37-1、L49-1。 |
| **B2 L03-2** | “Alors, il aurait pourtant suffi d’un simple coup de téléphone…”（Alors 与 pourtant 矛盾）。 |
| **B1 L22-1 / L25-3 / L10-1** | 无结构问题，但 Q 与键的问题见第 4 节。 |

我另外用脚本扫了“结束语之后又出现新句子”的情况，只有上面 L32-1、L47-1 两处实质性的（L12-1、L27-3 是误报：前者的 “Merci Léa.” 之后是正常的下一轮，后者是文档边界）。B1 Ex3 新增的“témoignage”段落（L03-3、L17-3、L41-3 等）和 B2 Ex3 加长的文档读起来连贯。新增段落没有让任何干扰项变成真的（我对 49 个“错项词汇出现在新增句子里”的情况逐一看过，只有上面的 L27-2 Q3 和下面的 L03-1 Q8 值得一提）。

**B2 L03-1 Q8** 低风险：新增段落里 Paul Okafor 说 “Voilà la bonne question”（指“qui paie tout ça quand c’est gratuit ?”），而 Q8 问“la vraie question”，错项之一是“Celle de son prix”。原文之前明确说“不是免费还是付费，而是 qui parle”，所以键仍对，但多了一个可争辩的角度。

### 6.2 语域

作者声称“录播通知、语音信箱、正式公告里不出现犹豫语”。实际上 B2 Ex3 的 150 段里有 12 段含 “Euh…”（10 段在第 3 段文档），其中至少 7 段是录播公告或宣传：L20-3 doc3（夜间公交上线）、L28-3 doc3（接待魁北克学生的家庭征集）、L31-3 doc3（天文学家线上问答）、L35-3 doc3（演讲比赛）、L40-3 doc3（慈善跑：“…pédiatrie. Euh… l’an dernier, mille quatre cents participants…”）、L45-3 doc3（“Nuits du Lac”须知：“Les portes ouvrent à dix-sept heures. Euh… pour des raisons de sécurité…”）、L48-3 doc3。另外，制作好的节目片头也插入了 “Euh…”：B2 L03-1、L05-1、L20-1、L23-1（“Bonsoir et bienvenue dans « Le grand débat ». Euh…”）；“Franchement,” 出现在节目开场白后（L28-1、L35-1、L40-1、L45-1）。

### 6.3 坏法语（新增的）

“Disons que” 后面接倒装疑问句：B1 L11-2（“Disons que depuis quand faites-vous cela ?”）、L25-2、L27-2；B2 L01-2（“Disons que vous arrive-t-il de regretter Paris ?”）、L41-2。主持人问句开头的 “Bref, vous êtes parti seul ?”（B1 L06-2）、“Bref, votre message pour l’été ?”（L40-2）。此外有第 4 节 B 中的各条。其余 “de le / vous vous / nous nous” 等扫描结果都是合法用法。原有的 “pour lesquels vous n’êtes pas responsable”（B1 L22-1）不是本轮造成的。

### 6.4 题序

作者只对 B2 Ex3 做了“按文档顺序”（已核实成立）。其余练习里，我按每题 `why` 引文在脚本中的位置检验题序：B1 听力三个练习里出现倒序的单元（每个练习 50 个）从 3 / 0 / 2 个变成 31 / 29 / 26 个，倒序的题以新插入的开放题为主（47 道开放题与 80 道选择题）；B2 听力 Ex1/Ex2 13 / 17 → 35 / 32，Ex3 2 → 16。多数是同一句话附近的小倒序，少数是真倒序（如 B1 L01-1 Q7，位置 874 在 Q6 的 1115 之前；B2 L05-2 的 Q4–Q7 引文位置都早于 Q3）。官方听力题序与录音完全一致，这点值得对齐。B2 阅读 Ex2/Ex3 的倒序是体裁使然（原来就有）。

### 6.5 英文译文与验证器

`node scripts/check-i18n.js`：“Interface languages: catalogs zh-CN · en complete; course translations (en) complete and faithful”，通过。我另外抽查译文结构与题序一致，没有发现不同步。

`node scripts/check-course.js`：`course/ (delf-b1) is valid: 50 days, 800 items, 2250 chunks, 1840 grammar questions in 41 banks — 60258 checks.`
`node scripts/check-course.js course/b2`：`course/b2/ (delf-b2) is valid: 50 days, 550 items, 1250 chunks, 840 grammar questions in 30 banks — 35402 checks.`
`node scripts/verify.js`：“All checks passed.”（含 300 段录音与文字稿逐句对应）。

验证器没有覆盖的：开放题与选择题的重复、跨题答案泄露、`accept` 对原文逐字答案的接纳、答案句式（首词、“Parce que”）泄露、对话连贯性、题序、语域；阈值本身也宽（最长项 ≤ 40%，绝对化词 ±4 个百分点）。

## 7. 仍需处理的事项（按优先级）

**P0（会让学习者学错，或直接答错）**

1. 改正第 4 节 A 的三个键：B1 L22-1 Q5（改成“Il est en congé.”一类）、B2 L27-2 Q3（改写 C 或键，使二者互斥）、B1 L10-1 Q5（vieux → ancien）。
2. 重写同义反复 / 空话的键：B1 L24-3 Q2、L49-2 Q2、L49-3 Q3、L04-3 Q7、L32-2 Q9、L17-3 Q9，B2 L20-2 Q7、L27-2 Q3、L03-1 Q5。
3. 修复三处脚本：B2 L32-1（把“un mot pour conclure”移到最后并作答）、L47-1（把新增问答移到“pour conclure”之前，并把嵌入的主持人提问拆成独立一轮）、L27-2（删除 seg5 重复的“voyageurs occasionnels”问答或使其与 seg1 一致，并改写 “il lui serait toutefois reproché…”）。

**P1（质量）**

4. 去掉开放题与选择题的重复（第 4 节 C 的约 15 组）：删除选择题或改问另一个点；并在 `check-course.js` 把“同一段引文不得被两道题使用”扩展到开放题、摘录题，另加“开放题的 accept 元素不得出现在同一练习的其他题干 / 选项里”。
5. 修正 `accept`：补上原文逐字答案（R35-3 Q5、R37-2 Q3、R38-2 Q4、R43-3 Q4：加入 “six demandes sur dix”“un Français sur six”“un salarié sur trois”“un tiers”）；删掉单个常见词（R06-3 Q3、R10-3 Q7、L14-3 Q5、L48-2 Q4 等约 11 题）。在 `app/answers.js` 给摘录 / 简答加长度上限（例如不超过 `model` 的 3 倍），否则整篇粘贴就是满分。
6. 语域：把 B2 Ex3 里 12 处 “Euh…”（至少 7 处在公告 / 宣传里）和节目片头的 “Euh…”“Franchement,” 删掉；“Disons que + 倒装疑问”（5 处）改正；口语标记换成更多样的形式（现在 Bon / En fait / Franchement / Euh… 四种占绝大多数），B1 Ex3 和 B2 Ex3 真正需要口语化的段落（采访、证言）补充标记。
7. 对话连贯性：把 L09-1 seg5、L19-2 seg4 的先行词与重复提问理顺；删掉不对应任何题的整段加长，或者为它们补题。

**P2**

8. B2 听力 Ex3：把一半以上的文档改成“观点型”（专家说明、读者来信、小评论），题目要求归纳作者态度；L40-3 Q1 这类 A2 陪衬项改成“原文里出现过但归因错误”的内容。
9. 选项句式齐整：同一题的三个选项使用相同起始结构（都带或都不带 “Parce que”），避免异类 = 正确项；B1 里正确项比错误项更常含“et / 逗号”的现象也要平衡。B1 阅读、B2 听力 Ex1/Ex2 的“最短即正确”别再升高。
10. 简答的深度：B1 的数字检索占 86%，至少把约三分之一换成“Pourquoi…？/ Qu’est-ce qui…？”；B2 阅读的 73 道“Citez deux…”里补足真正的“用自己的话”题（官方每套 1–2 道，现在只有 4 道）。
11. 题序：B1/B2 听力把新增的开放题放在与其引文对应的位置，保持与录音同序。

**P3**

12. B2 范文增加虚拟式、让步和 *dont*（0 变化）；B1 Ex3、B2 Ex3 体裁多样化；B1 听力 Ex1/Ex2 如要对齐审计建议的 350–400 词，需再加长约 10%。

## 8. 我没有核实或不能确定的

- 录音的自然度、停顿和语速体验（只看了时长与词数）。
- B1 官方样卷：我这次没能重新取回（403 / 404），B1 的官方数字沿用第一次审计，未独立验证。B2 官方词数是我对 exemple 3 转写稿的手工估算，误差约 ±10%。
- “推断类 / 字面类”题干的占比用的是关键词启发式，只能看相对变化。
- 我对约 160 道题做了全文核对、约 120 道在上下文中核对；其余 3,000 多道选择题只做了脚本筛查（引文存在性、词汇覆盖、长度和句式统计、新增文本对干扰项的影响）。脚本筛不出的“语义上也成立的错项”，可能还有。
- 没有评估口语、B2 application、前端行为。

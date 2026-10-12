/** The guide: how the course works, the exam of its level, how it is graded, every grammar point, resources and sources. */
import { getCourse, allNodes } from '../course.js';
import { html, icon, frText, MODULE_NAMES, MODULE_FR, UNITS } from '../ui.js';

const METHOD = [
  ['grammar', '每题作答后立即显示解析，答错的题自动进入错题本。Day 41–50 按你正确率最低的三个语法点自适应补练。'],
  ['production', '每条提示造 2 个句子，写下或说出后打勾。'],
  ['reading', '先通读全文，再逐题作答；每题答后显示依据。'],
  ['listening', '先只听不看原文，作答后再对照原文复听。'],
  ['writing', '草稿随输入保存；对照字数与自查清单后提交，可多次提交。'],
  ['speaking', '按目标时长录音，录音保存在你的账号；也可计时练习。'],
  ['application', '使用给出的表达完成情境或转述任务，关键词会实时标出。'],
  ['vocab', '当天材料与任务中的高频搭配：看中文和例句，在空格处写出缺少的法语；拼写（含重音）须准确，空格和大小写不计。拼对记为“记住”，拼错或看答案记为“再练”，会再次出现。'],
  ['review', '按 1、3、7、14、21、30、45 天的间隔，交替复现前面各天的语法题和词块（词块同样需要拼写）；答错的语法题进入错题本。']
];

export async function guideView() {
  const course = getCourse(), nodes = allNodes();
  return {
    title: '指南',
    render: () => html`<article class="page guide-page">
      <header class="page-head">
        <p class="eyebrow">Mode d’emploi</p>
        <h1 class="display-s">学习指南</h1>
        <p class="lead">${course.intro || ''} 选择每日强度后，按今日页的模块依次完成即可；顶栏可随时切换级别，各级别的进度互不影响，所有记录实时保存在你的账号中。</p>
      </header>

      <section>
        <h2 class="section-title"><span>Intensité</span>每日强度</h2>
        <div class="levels">${Object.entries(course.levels).map(([k, v]) => {
          const q = course.quotas[k];
          return html`<div class="level"><p class="level-name">${v.label}</p>
            <p class="muted small">${['grammar', 'reading', 'listening', 'writing', 'speaking', 'application', 'production', 'vocab', 'review'].map((m) => `${MODULE_NAMES[m]} ${q[m]} ${UNITS[m]}`).join(' · ')}</p></div>`;
        })}</div>
      </section>

      <section>
        <h2 class="section-title"><span>Méthode</span>每个模块怎么学</h2>
        <ul class="method">${METHOD.map(([k, t]) => html`<li><span class="mod-icon">${icon(k)}</span><div><p><b>${MODULE_NAMES[k]}</b> <span class="muted" lang="fr">${MODULE_FR[k]}</span></p><p class="muted">${t}</p></div></li>`)}</ul>
      </section>

      ${course.exam ? html`<section>
        <h2 class="section-title"><span>L’examen</span>${course.exam.name} 考试结构</h2>
        <div class="exam">${course.exam.parts.map(([fr, zh, t, d]) => html`<div class="exam-part"><p class="eyebrow" lang="fr">${fr}</p><p class="exam-name">${zh}<span>${t} · 25 分</span></p><p class="muted">${d}</p></div>`)}</div>
        <p class="muted small">${course.exam.rule}</p>
      </section>` : ''}

      ${course.rubrics ? html`<section>
        <h2 class="section-title"><span>Évaluation</span>写作与口语的官方评分维度</h2>
        <div class="exam">${[['writing', '写作 · Production écrite'], ['speaking', '口语 · Production orale']].map(([k, t]) => html`<div class="exam-part"><p class="eyebrow">${t}</p>
          <dl class="grid-dl">${course.rubrics[k].map(([c, d]) => html`<dt lang="fr">${frText(c)}</dt><dd>${d}</dd>`)}</dl></div>`)}</div>
        <p class="muted small">依据 France Éducation international 公布的评分表与评分标准说明；写作和口语页面也可随时展开对照。</p>
      </section>` : ''}

      ${course.resources ? html`<section>
        <h2 class="section-title"><span>Ressources</span>免费拓展资源</h2>
        <ul class="sources">${course.resources.map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener">${r.name}</a><span class="muted">${MODULE_NAMES[r.skill] || ''} · ${r.note}</span></li>`)}</ul>
      </section>` : ''}

      <section>
        <h2 class="section-title"><span>Grammaire</span>语法点 <small>${nodes.length} 个</small></h2>
        <ul class="nodes">${nodes.map((n) => html`<li><a href="#/day/${n.firstDay}/grammar"><span class="tag">${n.level}</span><b lang="fr">${frText(n.name)}</b><span class="muted">${n.use || ''}</span><small>Jour ${n.firstDay}</small></a></li>`)}</ul>
      </section>

      <section>
        <h2 class="section-title"><span>Sources</span>资料来源</h2>
        <ul class="sources">${course.sources.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a><span class="muted">${s.note || ''}</span></li>`)}</ul>
      </section>
    </article>`
  };
}

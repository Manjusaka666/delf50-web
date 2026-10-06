/** The guide: how the course works, the DELF B1 exam, every grammar point and the sources. */
import { getCourse, allNodes } from '../course.js';
import { html, icon, frText, MODULE_NAMES, MODULE_FR } from '../ui.js';

const EXAM = [
  ['Compréhension de l’oral', '听力', '约 25 分钟', '三段录音，每段听两遍，回答选择与简答题。'],
  ['Compréhension des écrits', '阅读', '45 分钟', '两篇文章：找出符合要求的信息，理解观点与论证。'],
  ['Production écrite', '写作', '45 分钟', '一篇不少于 160 词的文章、信件或论坛帖子，表达并论证观点。'],
  ['Production orale', '口语', '约 15 分钟', '指导性对话、互动练习、对一篇短文表达观点（准备 10 分钟）。']
];

const METHOD = [
  ['grammar', '每题作答后立即显示解析，答错的题自动进入错题本。Day 41–50 按你正确率最低的三个语法点自适应补练。'],
  ['production', '每条提示造 2 个句子，写下或说出后打勾。'],
  ['reading', '先通读全文，再逐题作答；每题答后显示依据。'],
  ['listening', '先只听不看原文，作答后再对照原文复听。'],
  ['writing', '草稿随输入保存；对照字数与自查清单后提交，可多次提交。'],
  ['speaking', '按目标时长录音，录音保存在你的账号；也可计时练习。'],
  ['application', '使用给出的表达完成情境任务，关键词会实时标出。'],
  ['vocab', '当天材料与任务中的高频搭配：看中文和挖空例句，先说出法语，再翻面核对、听发音，自评“记住了 / 再练”。'],
  ['review', '按 1、3、7、14、21、30、45 天的间隔，交替复现前面各天的语法题和词块；答错的语法题进入错题本。']
];

export async function guideView() {
  const course = getCourse(), nodes = allNodes();
  return {
    title: '指南',
    render: () => html`<article class="page guide-page">
      <header class="page-head">
        <p class="eyebrow">Mode d’emploi</p>
        <h1 class="display-s">学习指南</h1>
        <p class="lead">50 天、四个阶段，每天固定的语法、阅读、听力、写作、口语与应用任务。选择每日强度后，按今日页的模块依次完成即可；所有记录实时保存在你的账号中。</p>
      </header>

      <section>
        <h2 class="section-title"><span>Intensité</span>每日强度</h2>
        <div class="levels">${Object.entries(course.levels).map(([k, v]) => {
          const q = course.quotas[k];
          return html`<div class="level"><p class="level-name">${v.label}</p>
            <p class="muted small">语法 ${q.grammar} 题 · 阅读 ${q.reading} 篇 · 听力 ${q.listening} 组 · 写作 ${q.writing} 项 · 口语 ${q.speaking} 轮 · 应用 ${q.application} 项 · 产出 ${q.production} 句 · 词块 ${q.vocab} · 复习 ${q.review}</p></div>`;
        })}</div>
      </section>

      <section>
        <h2 class="section-title"><span>Méthode</span>每个模块怎么学</h2>
        <ul class="method">${METHOD.map(([k, t]) => html`<li><span class="mod-icon">${icon(k)}</span><div><p><b>${MODULE_NAMES[k]}</b> <span class="muted" lang="fr">${MODULE_FR[k]}</span></p><p class="muted">${t}</p></div></li>`)}</ul>
      </section>

      <section>
        <h2 class="section-title"><span>L’examen</span>DELF B1 考试结构</h2>
        <div class="exam">${EXAM.map(([fr, zh, t, d]) => html`<div class="exam-part"><p class="eyebrow" lang="fr">${fr}</p><p class="exam-name">${zh}<span>${t} · 25 分</span></p><p class="muted">${d}</p></div>`)}</div>
        <p class="muted small">总分 100，及格 50 分，且每项不低于 5 分。</p>
      </section>

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

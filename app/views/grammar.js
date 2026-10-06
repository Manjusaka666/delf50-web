/** Grammar: the day's questions one at a time, the guide of each node, and output practice. */
import { store, commit } from '../store.js';
import { node } from '../course.js';
import { grammarAnswer } from '../progress.js';
import { answerGrammar, setProduction, productionKey } from '../state.js';
import { html, icon, pad2, frText, LETTERS, MODULE_NAMES } from '../ui.js';
import { dayContext, crumbs } from './common.js';

export async function grammarView(d, n) {
  const ctx = await dayContext(d);
  const qs = ctx.day.grammar, due = ctx.plan.grammar.length;
  const toProduction = n === 'production';
  if (!n || toProduction) {
    const open = qs.findIndex((q, i) => i < due && !grammarAnswer(store.S, d, q));
    const any = qs.findIndex((q) => !grammarAnswer(store.S, d, q));
    n = (open >= 0 ? open : any >= 0 ? any : 0) + 1;
  }
  n = Math.min(Math.max(1, n), qs.length);
  let scrolled = false;
  const go = (i) => { if (i >= 1 && i <= qs.length) location.hash = `#/day/${d}/grammar/${i}`; };

  function guide(nd) {
    const g = nd.guide;
    if (!g) return '';
    const list = (t, xs) => (xs && xs.length ? html`<h4>${t}</h4><ul>${xs.map((x) => html`<li>${frText(x)}</li>`)}</ul>` : '');
    return html`<details class="guide" open>
      <summary><span class="eyebrow">Fiche · ${nd.level}</span><span class="guide-name">${nd.name}</span></summary>
      <p class="guide-title">${g.title}</p>
      <p>${g.why}</p>
      ${g.formula && g.formula.length ? html`<div class="formula">${g.formula.map((x) => html`<p>${frText(x)}</p>`)}</div>` : ''}
      ${list('对比', g.contrast)}${list('常见错误', g.errors)}${list('DELF 用法', g.delf)}
      ${nd.examples && nd.examples.length ? html`<h4>例句</h4><ul class="examples">${nd.examples.map((x) => html`<li lang="fr">${frText(x)}</li>`)}</ul>` : ''}
    </details>`;
  }

  function production() {
    const target = ctx.plan.targets.production, m = ctx.progress().modules.production;
    return html`<section class="prod" id="production">
      <h2 class="section-title"><span>Production</span>主动产出 <small>${m.done} / ${target} 句</small></h2>
      <p class="muted">每条提示完成 2 个句子（写下或说出），完成后打勾。</p>
      ${ctx.plan.production.map((p) => html`<div class="prod-node">
        <h3>${p.node.name} <small>${p.node.use || ''}</small></h3>
        <ul>${p.prompts.map((t, i) => {
          const on = Boolean(store.S.production[productionKey(d, p.node.id, i)]);
          return html`<li><button class="check ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" data-act="prod" data-node="${p.node.id}" data-i="${i}">
            <span class="box">${icon('check')}</span><span>${frText(t)}</span></button></li>`;
        })}</ul>
      </div>`)}
    </section>`;
  }

  const render = () => {
    const q = qs[n - 1], nd = node(q.node), a = grammarAnswer(store.S, d, q), m = ctx.progress().modules.grammar;
    const answered = qs.filter((x) => grammarAnswer(store.S, d, x)), right = answered.filter((x) => grammarAnswer(store.S, d, x).correct).length;
    return html`<article class="page grammar">
      ${crumbs(d, MODULE_NAMES.grammar)}
      <header class="page-head">
        <p class="eyebrow">Grammaire · ${ctx.day.grammarFocus}</p>
        <h1 class="display-s">${ctx.day.title}</h1>
        <p class="muted">今日 ${m.done} / ${m.total} 题 · 已答 ${answered.length} 题，正确 ${right} 题</p>
      </header>
      <nav class="dots" aria-label="题目">
        ${qs.map((x, i) => {
          const s = grammarAnswer(store.S, d, x);
          return html`<a href="#/day/${d}/grammar/${i + 1}" class="dot-q ${i + 1 === n ? 'on' : ''} ${s ? (s.correct ? 'ok' : 'bad') : ''} ${i >= due ? 'extra' : ''}" aria-label="第 ${i + 1} 题${s ? (s.correct ? '，正确' : '，错误') : ''}${i >= due ? '，选做' : ''}">${i + 1}</a>`;
        })}
      </nav>
      <div class="split">
        <section class="qcard ${a ? (a.correct ? 'is-ok' : 'is-bad') : ''}" aria-live="polite">
          <p class="qcard-meta"><span>Question ${pad2(n)} / ${pad2(qs.length)}</span><span class="tag">${nd ? nd.name : q.node}</span>${n > due ? html`<span class="tag soft">选做</span>` : ''}</p>
          <p class="stem" lang="fr">${frText(q.stem)}</p>
          <div class="opts" role="group" aria-label="选项">
            ${q.options.map((o, i) => {
              const cls = a ? (i === q.answer ? 'right' : i === a.selectedIndex ? 'wrong' : 'dim') : '';
              return html`<button class="opt ${cls}" data-act="answer" data-i="${i}" ${a ? 'disabled' : ''} lang="fr">
                <span class="opt-key">${LETTERS[i]}</span><span class="opt-text">${frText(o)}</span>
                ${a && i === q.answer ? icon('check', 'opt-mark') : a && i === a.selectedIndex ? icon('cross', 'opt-mark') : ''}</button>`;
            })}
          </div>
          ${a ? html`<div class="feedback"><p class="feedback-head">${a.correct ? '回答正确' : '已记入错题本'}</p>${q.why ? html`<p>${frText(q.why)}</p>` : ''}</div>` : html`<p class="hint">按 ${LETTERS.slice(0, q.options.length).join(' / ')} 或数字键作答，答案提交后不可更改。</p>`}
          <div class="qnav">
            <button class="btn ghost" data-act="prev" ${n > 1 ? '' : 'disabled'}>${icon('left')} 上一题</button>
            ${n < qs.length ? html`<button class="btn ${a ? '' : 'ghost'}" data-act="next">下一题 ${icon('right')}</button>` : html`<button class="btn" data-act="toProd">主动产出 ${icon('right')}</button>`}
          </div>
        </section>
        <aside class="side">${nd ? guide(nd) : ''}</aside>
      </div>
      ${production()}
    </article>`;
  };

  const answer = (i) => {
    const q = qs[n - 1];
    if (grammarAnswer(store.S, d, q) || i < 0 || i >= q.options.length) return;
    commit((S) => answerGrammar(S, d, q, node(q.node), i));
  };

  return {
    title: `语法 · Jour ${d}`,
    render,
    mount: () => { if (toProduction && !scrolled) { scrolled = true; requestAnimationFrame(() => document.getElementById('production').scrollIntoView({ block: 'start' })); } },
    actions: {
      answer: (el) => answer(Number(el.dataset.i)),
      prev: () => go(n - 1),
      next: () => go(n + 1),
      toProd: () => document.getElementById('production').scrollIntoView({ behavior: 'smooth', block: 'start' }),
      prod: (el) => {
        const k = productionKey(d, el.dataset.node, Number(el.dataset.i));
        commit((S) => setProduction(S, d, el.dataset.node, Number(el.dataset.i), !S.production[k]));
      }
    },
    keys: (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const i = /^[1-5]$/.test(k) ? Number(k) - 1 : LETTERS.map((x) => x.toLowerCase()).indexOf(k);
      if (i >= 0) { e.preventDefault(); answer(i); }
      else if (k === 'arrowright' || (k === 'enter' && grammarAnswer(store.S, d, qs[n - 1]))) { e.preventDefault(); go(n + 1); }
      else if (k === 'arrowleft') { e.preventDefault(); go(n - 1); }
    }
  };
}

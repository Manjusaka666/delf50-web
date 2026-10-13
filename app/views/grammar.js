/** Grammar: the day's questions one at a time, the guide of each node, and output practice. */
import { store, commit } from '../store.js';
import { node, remedialNodes, LEVELS, currentLevel } from '../course.js';
import { grammarAnswer } from '../progress.js';
import { answerGrammar, setProduction, saveProduction, productionKey } from '../state.js';
import { html, icon, pad2, frText, LETTERS, moduleName } from '../ui.js';
import { t } from '../i18n.js';
import { dayContext, crumbs } from './common.js';

export async function grammarView(d, n) {
  const ctx = await dayContext(d);
  const qs = ctx.grammar, due = ctx.plan.grammar.length;
  const toProduction = n === 'production';
  if (!n || toProduction) {
    const open = qs.findIndex((q, i) => i < due && !grammarAnswer(store.S, d, q.id));
    const any = qs.findIndex((q) => !grammarAnswer(store.S, d, q.id));
    n = (open >= 0 ? open : any >= 0 ? any : 0) + 1;
  }
  n = Math.min(Math.max(1, n), qs.length);
  let scrolled = false;
  const bridgeTo = (LEVELS[LEVELS.indexOf(currentLevel()) + 1] || currentLevel()).level;
  const go = (i) => { if (i >= 1 && i <= qs.length) location.hash = `#/day/${d}/grammar/${i}`; };

  function guide(nd) {
    const g = nd.guide;
    if (!g) return '';
    const list = (title, xs) => (xs && xs.length ? html`<h4>${title}</h4><ul>${xs.map((x) => html`<li>${frText(x)}</li>`)}</ul>` : '');
    return html`<details class="guide" open>
      <summary><span class="eyebrow">Fiche · ${nd.level}</span><span class="guide-name">${nd.name}</span></summary>
      <p class="guide-title">${g.title}</p>
      <p>${g.why}</p>
      ${g.formula && g.formula.length ? html`<div class="formula">${g.formula.map((x) => html`<p>${frText(x)}</p>`)}</div>` : ''}
      ${list(t('grammar.contrast'), g.contrast)}${list(t('grammar.errors'), g.errors)}${list(t('grammar.delf'), g.delf)}
      ${nd.examples && nd.examples.length ? html`<h4>${t('grammar.examples')}</h4><ul class="examples">${nd.examples.map((x) => html`<li lang="fr">${frText(x)}</li>`)}</ul>` : ''}
    </details>`;
  }

  function production() {
    const target = ctx.plan.targets.production, m = ctx.progress().modules.production;
    return html`<section class="prod" id="production">
      <h2 class="section-title"><span>Production</span>${moduleName('production')} <small data-prod-count>${t('production.count', { done: m.done, target })}</small></h2>
      <p class="muted">${t('production.how')}</p>
      ${ctx.plan.production.map((p) => html`<div class="prod-node">
        <h3>${p.node.name} <small>${p.node.use || ''}</small></h3>
        <ul>${p.prompts.map((text, i) => {
          const k = productionKey(d, p.node.id, i), on = Boolean(store.S.production[k]);
          return html`<li><button class="check ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" data-act="prod" data-node="${p.node.id}" data-i="${i}" data-k="${k}">
            <span class="box">${icon('check')}</span><span>${frText(text)}</span></button>
            <textarea class="prod-ed" data-input="prodtext" data-node="${p.node.id}" data-i="${i}" rows="2" lang="fr" spellcheck="true" aria-label="${t('production.input')}" placeholder="Écrivez vos deux phrases ici…">${store.S.drafts.production[k] || ''}</textarea></li>`;
        })}</ul>
      </div>`)}
    </section>`;
  }

  const render = () => {
    const q = qs[n - 1], nd = node(q.node), a = grammarAnswer(store.S, d, q.id), m = ctx.progress().modules.grammar;
    const answered = qs.filter((x) => grammarAnswer(store.S, d, x.id)), right = answered.filter((x) => grammarAnswer(store.S, d, x.id).correct).length;
    return html`<article class="page grammar">
      ${crumbs(d, moduleName('grammar'))}
      <header class="page-head">
        <p class="eyebrow">Grammaire · ${ctx.day.grammarFocus}</p>
        <h1 class="display-s">${ctx.day.title}</h1>
        <p class="muted">${t('grammar.summary', { done: m.done, total: m.total, answered: answered.length, right })}</p>
        ${ctx.day.remedial ? html`<p class="notice">${t('grammar.remedial', { list: remedialNodes(store.S, d).map((id) => node(id).name) })}</p>` : ''}
      </header>
      <nav class="dots" aria-label="${t('grammar.questions')}">
        ${qs.map((x, i) => {
          const s = grammarAnswer(store.S, d, x.id);
          return html`<a href="#/day/${d}/grammar/${i + 1}" class="dot-q ${i + 1 === n ? 'on' : ''} ${s ? (s.correct ? 'ok' : 'bad') : ''} ${i >= due ? 'extra' : ''}" aria-label="${t('grammar.dot', { n: i + 1, state: s ? (s.correct ? 'ok' : 'bad') : '', optional: i >= due })}">${i + 1}</a>`;
        })}
      </nav>
      <div class="split">
        <section class="qcard ${a ? (a.correct ? 'is-ok' : 'is-bad') : ''}" data-key="q:${q.id}" data-state="${a ? (a.correct ? 'ok' : 'bad') : ''}" aria-live="polite">
          <p class="qcard-meta"><span>Question ${pad2(n)} / ${pad2(qs.length)}</span><span class="tag">${nd ? nd.name : q.node}</span>${(ctx.day.bridge || []).includes(q.id) ? html`<span class="tag bridge">${t('grammar.bridge', { level: bridgeTo })}</span>` : n > due ? html`<span class="tag soft">${t('common.optional')}</span>` : ''}</p>
          <p class="stem" lang="fr">${frText(q.stem)}</p>
          <div class="opts" role="group" aria-label="${t('common.options')}">
            ${q.options.map((o, i) => {
              const cls = a ? (i === q.answer ? 'right' : i === a.selectedIndex ? 'wrong' : 'dim') : '';
              return html`<button class="opt ${cls}" data-act="answer" data-i="${i}" ${a ? 'disabled' : ''} lang="fr">
                <span class="opt-key">${LETTERS[i]}</span><span class="opt-text">${frText(o)}</span>
                ${a && i === q.answer ? icon('check', 'opt-mark') : a && i === a.selectedIndex ? icon('cross', 'opt-mark') : ''}</button>`;
            })}
          </div>
          ${a ? html`<div class="feedback"><p class="feedback-head">${a.correct ? t('common.correct') : t('common.toErrors')}</p>${q.why ? html`<p>${frText(q.why)}</p>` : ''}</div>` : html`<p class="hint">${t('grammar.hint', { keys: LETTERS.slice(0, q.options.length).join(' / ') })}</p>`}
          <div class="qnav">
            <button class="btn ghost" data-act="prev" ${n > 1 ? '' : 'disabled'}>${icon('left')} ${t('common.prev')}</button>
            ${n < qs.length ? html`<button class="btn ${a ? '' : 'ghost'}" data-act="next">${t('common.nextQ')} ${icon('right')}</button>` : html`<button class="btn" data-act="toProd">${moduleName('production')} ${icon('right')}</button>`}
          </div>
        </section>
        <aside class="side">${nd ? guide(nd) : ''}</aside>
      </div>
      ${production()}
    </article>`;
  };

  const answer = (i) => {
    const q = qs[n - 1];
    if (grammarAnswer(store.S, d, q.id) || i < 0 || i >= q.options.length) return;
    commit((S) => answerGrammar(S, d, q, node(q.node), i));
  };

  // Typing keeps the focus: the prompt's box and the count are updated in place.
  const prodText = (el) => {
    const node = el.dataset.node, i = Number(el.dataset.i), k = productionKey(d, node, i);
    commit((S) => saveProduction(S, d, node, i, el.value), { quiet: true });
    const on = Boolean(store.S.production[k]), b = document.querySelector(`[data-k="${k}"]`), c = document.querySelector('[data-prod-count]');
    if (b) { b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    if (c) c.textContent = t('production.count', { done: ctx.progress().modules.production.done, target: ctx.plan.targets.production });
  };

  return {
    title: `${moduleName('grammar')} · Jour ${d}`,
    render,
    inputs: { prodtext: prodText },
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
      else if (k === 'arrowright' || (k === 'enter' && grammarAnswer(store.S, d, qs[n - 1].id))) { e.preventDefault(); go(n + 1); }
      else if (k === 'arrowleft') { e.preventDefault(); go(n - 1); }
    }
  };
}

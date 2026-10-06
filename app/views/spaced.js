/** Spaced review: earlier days' grammar questions and chunks, resurfacing at growing intervals. */
import { store, commit, refresh } from '../store.js';
import { node, reviewItems } from '../course.js';
import { answerReview } from '../state.js';
import { html, icon, pad2, frText, LETTERS, MODULE_NAMES } from '../ui.js';
import * as speech from '../speech.js';
import { dayContext, crumbs, recallCard, plainExample } from './common.js';

export async function spacedView(d) {
  const ctx = await dayContext(d);
  const items = await reviewItems(d, store.S);
  const rec = (x) => store.S.review[`${d}:${x.key}`] || null;
  let n = Math.max(0, items.findIndex((x) => !rec(x))), revealed = false;
  if (items.length && items.every(rec)) n = 0;
  const due = () => ctx.plan.targets.review;
  const go = (i) => { if (i >= 0 && i < items.length) { n = i; revealed = false; refresh(); } };

  const grammarCard = (x, r) => {
    const q = x.question;
    return html`<section class="qcard ${r ? (r.correct ? 'is-ok' : 'is-bad') : ''}" aria-live="polite">
      <p class="qcard-meta"><span>Jour ${pad2(x.src)} · ${pad2(n + 1)} / ${pad2(items.length)}</span><span class="tag">${node(q.node).name}</span>${n >= due() ? html`<span class="tag soft">选做</span>` : ''}</p>
      <p class="stem" lang="fr">${frText(q.stem)}</p>
      <div class="opts" role="group">${q.options.map((o, i) => {
        const cls = r ? (i === q.answer ? 'right' : i === r.selectedIndex ? 'wrong' : 'dim') : '';
        return html`<button class="opt ${cls}" data-act="answer" data-i="${i}" ${r ? 'disabled' : ''} lang="fr"><span class="opt-key">${LETTERS[i]}</span><span class="opt-text">${frText(o)}</span>
          ${r && i === q.answer ? icon('check', 'opt-mark') : r && i === r.selectedIndex ? icon('cross', 'opt-mark') : ''}</button>`;
      })}</div>
      ${r ? html`<div class="feedback"><p class="feedback-head">${r.correct ? '回答正确' : '已记入错题本'}</p>${q.why ? html`<p>${frText(q.why)}</p>` : ''}</div>` : ''}
      <div class="qnav"><button class="btn ghost" data-act="prev" ${n ? '' : 'disabled'}>${icon('left')} 上一项</button>
        ${n < items.length - 1 ? html`<button class="btn ${r ? '' : 'ghost'}" data-act="next">下一项 ${icon('right')}</button>` : html`<a class="btn" href="#/day/${d}">回到今日 ${icon('right')}</a>`}</div>
    </section>`;
  };

  const render = () => {
    const m = ctx.progress().modules.review;
    if (!items.length) return html`<article class="page">${crumbs(d, MODULE_NAMES.review)}<p class="muted">暂无可复习的内容。</p></article>`;
    const x = items[n], r = rec(x);
    const sources = [...new Set(items.map((i) => i.src))].sort((a, b) => b - a);
    return html`<article class="page spaced">
      ${crumbs(d, MODULE_NAMES.review)}
      <header class="page-head">
        <p class="eyebrow">Révision espacée</p>
        <h1 class="display-s">间隔复习</h1>
        <p class="muted">今日 ${m.done} / ${m.total} 项 · 复习 ${sources.map((s) => `Jour ${s}`).join('、')} 的语法与词块（间隔 1、3、7、14、21、30、45 天）。</p>
      </header>
      <nav class="dots" aria-label="复习项">${items.map((it, i) => {
        const v = rec(it);
        return html`<button class="dot-q ${i === n ? 'on' : ''} ${v ? (v.correct ? 'ok' : 'bad') : ''} ${i >= due() ? 'extra' : ''}" data-act="goto" data-i="${i}" aria-label="第 ${i + 1} 项">${it.kind === 'v' ? '词' : i + 1}</button>`;
      })}</nav>
      ${x.kind === 'g' ? grammarCard(x, r) : html`${recallCard(x.chunk, revealed || Boolean(r), `Jour ${pad2(x.src)} · ${pad2(n + 1)} / ${pad2(items.length)}${n >= due() ? ' · 选做' : ''}`, Boolean(r))}
        ${r ? html`<p class="hint">${r.correct ? '已记住' : '已标记为再练'} · <button class="linkish" data-act="next">下一项</button></p>` : ''}`}
    </article>`;
  };

  const answer = (v) => {
    const x = items[n];
    if (rec(x)) return;
    commit((S) => answerReview(S, d, x, v, x.kind === 'g' ? node(x.question.node) : null));
    if (x.kind === 'v' && n < items.length - 1) { n++; revealed = false; refresh(); }
  };
  const say = () => { const x = items[n]; if (x.kind === 'v') speech.play(`chunk:${x.chunk.id}`, [x.chunk.fr + '.', plainExample(x.chunk.ex)]); };

  return {
    title: `复习 · Jour ${d}`,
    render,
    unmount: () => speech.stop(),
    actions: {
      answer: (el) => answer(Number(el.dataset.i)),
      reveal: () => { revealed = true; refresh(); say(); },
      known: () => answer(true),
      again: () => answer(false),
      say,
      prev: () => go(n - 1),
      next: () => go(n + 1),
      goto: (el) => go(Number(el.dataset.i))
    },
    keys: (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const x = items[n], r = x && rec(x);
      if (!x) return;
      if (x.kind === 'g' && !r) {
        const i = /^[1-5]$/.test(e.key) ? Number(e.key) - 1 : LETTERS.map((l) => l.toLowerCase()).indexOf(e.key.toLowerCase());
        if (i >= 0 && i < x.question.options.length) { e.preventDefault(); answer(i); }
      } else if (x.kind === 'v' && !r) {
        if ((e.key === ' ' || e.key === 'Enter') && !revealed) { e.preventDefault(); revealed = true; refresh(); say(); }
        else if (e.key === '1' && revealed) { e.preventDefault(); answer(true); }
        else if (e.key === '2' && revealed) { e.preventDefault(); answer(false); }
      }
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && r)) { e.preventDefault(); go(n + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(n - 1); }
    }
  };
}

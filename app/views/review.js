/** The error book: every wrong grammar answer, grouped by grammar point, until it is marked as mastered. */
import { store, commit, refresh } from '../store.js';
import { resolveError } from '../state.js';
import { html, icon, frText, fmtDateTime } from '../ui.js';
import { empty } from './common.js';

export async function reviewView() {
  let filter = null;

  const render = () => {
    const all = store.S.errors.map((e, i) => ({ e, i })).reverse();
    const groups = new Map();
    for (const x of all) { const k = x.e.skill || '其他'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const shown = filter && groups.has(filter) ? groups.get(filter) : all;
    return html`<article class="page review">
      <header class="page-head">
        <p class="eyebrow">Révision</p>
        <h1 class="display-s">错题本</h1>
        <p class="muted">答错的语法题自动记入。复习时先遮住答案自己说出正确形式，确认掌握后移出错题本。</p>
      </header>
      ${all.length ? html`
        <div class="filters" role="tablist">
          <button class="chip ${filter ? '' : 'on'}" data-act="filter" data-k="">全部 <b>${all.length}</b></button>
          ${[...groups].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => html`<button class="chip ${filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${k} <b>${xs.length}</b></button>`)}
        </div>
        <ul class="errors">${shown.map(({ e, i }) => html`<li class="err">
          <p class="err-skill">${e.skill}<span class="muted">${fmtDateTime(e.at)}</span></p>
          <p class="err-line bad" lang="fr">${icon('cross')}<s>${frText(e.original)}</s></p>
          <p class="err-line ok" lang="fr">${icon('check')}<span>${frText(e.correct)}</span></p>
          ${e.why ? html`<p class="err-why">${frText(e.why)}</p>` : ''}
          <button class="btn ghost small" data-act="resolve" data-i="${i}">已掌握</button>
        </li>`)}</ul>` : empty('错题本是空的', '答错的语法题会出现在这里。')}
    </article>`;
  };

  return {
    title: '错题本',
    render,
    actions: {
      filter: (el) => { filter = el.dataset.k || null; refresh(); },
      resolve: (el) => commit((S) => resolveError(S, Number(el.dataset.i)))
    }
  };
}

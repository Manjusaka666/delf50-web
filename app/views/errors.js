/** The error book: every wrong grammar answer, grouped by grammar point, until it is marked as mastered. */
import { store, commit, refresh } from '../store.js';
import { resolveError } from '../state.js';
import { allNodes, loadQuestions } from '../course.js';
import { canonical } from '../content.js';
import { html, icon, frText, fmtDateTime } from '../ui.js';
import { t, getLocale } from '../i18n.js';
import { empty } from './common.js';

/**
 * An error records its explanation as the course wrote it (records are the
 * same in every language); shown in another language, it is looked up in its
 * grammar point's translated question bank.
 */
async function translations(errors) {
  const map = new Map();
  if (getLocale() === 'zh-CN') return map;
  const byName = new Map(allNodes().map((n) => [n.name, n]));
  const ids = [];
  for (const n of new Set(errors.map((e) => byName.get(e.skill)).filter(Boolean))) {
    for (let i = 1; i <= n.bank; i++) ids.push(`${n.id}-${String(i).padStart(2, '0')}`);
  }
  try {
    for (const q of (await loadQuestions(ids)).values()) {
      const base = canonical(q, 'why');
      if (base && q.why !== base) map.set(base, q.why);
    }
  } catch (e) { /* shown as recorded */ }
  return map;
}

export async function errorsView() {
  let filter = null;
  const why = await translations(store.S.errors);

  const render = () => {
    const all = store.S.errors.map((e, i) => ({ e, i })).reverse();
    const groups = new Map();
    for (const x of all) { const k = x.e.skill || t('errors.other'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const shown = filter && groups.has(filter) ? groups.get(filter) : all;
    return html`<article class="page review">
      <header class="page-head">
        <p class="eyebrow">Révision</p>
        <h1 class="display-s">${t('errors.title')}</h1>
        <p class="muted">${t('errors.lead')}</p>
      </header>
      ${all.length ? html`
        <div class="filters" role="tablist">
          <button class="chip ${filter ? '' : 'on'}" data-act="filter" data-k="">${t('errors.all')} <b>${all.length}</b></button>
          ${[...groups].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => html`<button class="chip ${filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${k} <b>${xs.length}</b></button>`)}
        </div>
        <ul class="errors">${shown.map(({ e, i }) => html`<li class="err">
          <p class="err-skill">${e.skill}<span class="muted">${fmtDateTime(e.at)}</span></p>
          <p class="err-line bad" lang="fr">${icon('cross')}<s>${frText(e.original)}</s></p>
          <p class="err-line ok" lang="fr">${icon('check')}<span>${frText(e.correct)}</span></p>
          ${e.why ? html`<p class="err-why">${frText(why.get(e.why) || e.why)}</p>` : ''}
          <button class="btn ghost small" data-act="resolve" data-i="${i}">${t('errors.resolve')}</button>
        </li>`)}</ul>` : empty(t('errors.empty'), t('errors.emptyNote'))}
    </article>`;
  };

  return {
    title: t('errors.title'),
    render,
    actions: {
      filter: (el) => { filter = el.dataset.k || null; refresh(); },
      resolve: (el) => commit((S) => resolveError(S, Number(el.dataset.i)))
    }
  };
}

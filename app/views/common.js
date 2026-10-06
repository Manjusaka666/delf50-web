/** Pieces shared by the views. */
import { store, refresh } from '../store.js';
import { download } from '../media.js';
import { getCourse, loadDay, plan } from '../course.js';
import { dayProgress, studyDays } from '../progress.js';
import { html, icon, pad2, MODULE_NAMES } from '../ui.js';

export const S = () => store.S;
export const levelLabel = (k) => getCourse().levels[k].label;

/** The day's material, plan and progress at the current intensity. */
export async function dayContext(d) {
  const day = await loadDay(d);
  return {
    day,
    get plan() { return plan(day, store.S.intensity); },
    progress() { return dayProgress(store.S, day, this.plan); }
  };
}

/** Progress of every day with records (their files are loaded), keyed by day. */
export async function studiedProgress(extra = []) {
  const ds = [...new Set([...studyDays(store.S).map((x) => x.day), ...extra])].filter((d) => d >= 1 && d <= getCourse().days);
  const days = await Promise.all(ds.map((d) => loadDay(d)));
  const out = new Map();
  for (const day of days) out.set(day.day, dayProgress(store.S, day, plan(day, store.S.intensity)));
  return { days, progress: out };
}

/** Breadcrumb-style header of a page inside a day. */
export function crumbs(d, label, sub = '') {
  return html`<nav class="crumbs" aria-label="位置">
    <a href="#/day/${d}" class="crumb-back">${icon('left')}<span>Jour ${pad2(d)}</span></a>
    <span class="crumb-sep">/</span><span>${label}</span>${sub ? html`<span class="crumb-sep">/</span><span class="muted">${sub}</span>` : ''}
  </nav>`;
}

/** Numbered pager across the items of a module; items beyond the plan are optional. */
export function pager(d, module, items, n, due, stateOf) {
  return html`<nav class="pager" aria-label="${MODULE_NAMES[module]}">
    ${items.map((it, i) => {
      const st = stateOf(it);
      return html`<a href="#/day/${d}/${module}/${i + 1}" class="pager-item ${i + 1 === n ? 'on' : ''} ${st.done ? 'done' : st.started ? 'started' : ''} ${i >= due ? 'extra' : ''}" ${i + 1 === n ? 'aria-current="page"' : ''} title="${it.title}${i >= due ? ' · 选做' : ''}">
        <span>${pad2(i + 1)}</span>${st.done ? icon('check') : ''}</a>`;
    })}
  </nav>`;
}

export function nextLink(d, module, n, count) {
  return n < count
    ? html`<a class="btn" href="#/day/${d}/${module}/${n + 1}">下一篇 ${icon('right')}</a>`
    : html`<a class="btn" href="#/day/${d}">回到今日 ${icon('right')}</a>`;
}

export const empty = (title, text) => html`<div class="empty"><p class="display-xs">${title}</p><p class="muted">${text}</p></div>`;

/** A stored recording: a button that fetches it from R2 once, then an audio player. */
export const clip = (players, id) => (players.get(id)
  ? html`<audio controls src="${players.get(id)}"></audio>`
  : html`<button class="chip" data-act="listen" data-clip="${id}">${icon('play')} 回放</button>`);

export const listenAction = (players) => async (el) => {
  el.disabled = true;
  try {
    const blob = await download(el.dataset.clip);
    if (!blob) { el.outerHTML = '<span class="tag soft">录音不可用</span>'; return; }
    players.set(el.dataset.clip, URL.createObjectURL(blob));
    refresh();
  } catch (e) { el.disabled = false; }
};

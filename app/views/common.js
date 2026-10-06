/** Pieces shared by the views. */
import { store, refresh, commit } from '../store.js';
import { download } from '../media.js';
import { getCourse, loadDay, plan, grammarIds, weakestNodes, loadQuestions } from '../course.js';
import { setRemedial } from '../state.js';
import { dayProgress, studyDays } from '../progress.js';
import { html, icon, pad2, frText, MODULE_NAMES } from '../ui.js';

export const S = () => store.S;
export const levelLabel = (k) => getCourse().levels[k].label;

/**
 * The day's material, its grammar questions, plan and progress at the current
 * intensity. Opening a remediation day fixes its grammar points.
 */
export async function dayContext(d) {
  const day = await loadDay(d);
  if (day.remedial && !store.S.remedial[String(d)]) commit((S) => setRemedial(S, d, weakestNodes(S)), { quiet: true });
  // Days 41–50 add optional B1→B2 bridge questions after the remediation.
  const ids = [...grammarIds(day, store.S), ...(day.bridge || [])], questions = await loadQuestions(ids);
  return {
    day,
    grammar: ids.map((id) => questions.get(id)),
    get plan() { return plan(day, store.S.intensity, store.S); },
    progress() { return dayProgress(store.S, day, this.plan); }
  };
}

/** Progress of every day with records (their files are loaded), keyed by day. */
export async function studiedProgress(extra = []) {
  const ds = [...new Set([...studyDays(store.S).map((x) => x.day), ...extra])].filter((d) => d >= 1 && d <= getCourse().days);
  const days = await Promise.all(ds.map((d) => loadDay(d)));
  const out = new Map();
  for (const day of days) out.set(day.day, dayProgress(store.S, day, plan(day, store.S.intensity, store.S)));
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

/** A chunk's example with the chunk shown, or replaced by a gap of its length. */
export function chunkExample(ex, reveal) {
  const m = /\[\[(.+?)\]\]/.exec(ex);
  if (!m) return frText(ex);
  const before = ex.slice(0, m.index), after = ex.slice(m.index + m[0].length);
  return html`${frText(before)}${reveal ? html`<mark class="chunk-hit">${frText(m[1])}</mark>` : html`<span class="gap" aria-label="空格">${' '.repeat(Math.min(18, Math.max(6, m[1].length)))}</span>`}${frText(after)}`;
}
export const plainExample = (ex) => ex.replace(/\[\[|\]\]/g, '');

const SRC = { R: '阅读', L: '听力', W: '写作', S: '口语', A: '应用' };
export const chunkSource = (src) => (src && SRC[src[0]] && /^[RLWSA]\d/.test(src) ? `${SRC[src[0]]} ${src.split('-')[1]}` : '主题词块');

/** Active recall: Chinese meaning and the gapped sentence first; the chunk, the full sentence and its sound after. */
export function recallCard(c, revealed, meta = '', done = false) {
  return html`<section class="qcard recall ${revealed ? 'open' : ''}" aria-live="polite">
    <p class="qcard-meta"><span>${meta}</span><span class="tag">${chunkSource(c.src)}</span></p>
    <p class="recall-zh">${c.zh}</p>
    <p class="recall-ex" lang="fr">${chunkExample(c.ex, revealed)}</p>
    ${revealed ? html`
      <div class="recall-back">
        <p class="recall-fr" lang="fr">${frText(c.fr)}<button class="icon-btn" data-act="say" aria-label="朗读">${icon('play')}</button></p>
        <p class="muted">${c.exZh}</p>
      </div>
      ${done ? '' : html`<div class="qnav"><button class="btn ghost" data-act="again">再练一次 <kbd>2</kbd></button><button class="btn" data-act="known">记住了 <kbd>1</kbd></button></div>`}`
    : html`<p class="hint">先在心里说出（或写下）缺少的法语表达，再翻面核对。</p>
      <div class="qnav end"><button class="btn" data-act="reveal">显示答案 <kbd>空格</kbd></button></div>`}
  </section>`;
}

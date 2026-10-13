/** Pieces shared by the views. */
import { store, refresh, commit } from '../store.js';
import { download } from '../media.js';
import { getCourse, loadDay, plan, grammarIds, weakestNodes, loadQuestions } from '../course.js';
import { setRemedial } from '../state.js';
import { dayProgress, studyDays } from '../progress.js';
import { html, icon, pad2, frText, moduleName } from '../ui.js';
import { t } from '../i18n.js';

export const S = () => store.S;
/** An intensity's name, from its daily study time (e.g. "6.5 hours"). */
export const levelLabel = (k) => t('intensity.hours', { h: getCourse().levels[k].minutes / 60 });

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

/** A task's document déclencheur: a short text the task starts from. */
export const triggerDoc = (doc) => (doc ? html`<figure class="trigger" lang="fr"><figcaption>${frText(doc.title)}</figcaption>
  <div class="prose small">${doc.text.map((p) => html`<p>${frText(p)}</p>`)}</div></figure>` : '');

/** The course's method (official advice) and evaluation criteria for a skill, folded away. */
export function examNotes(module) {
  const c = getCourse(), tips = (c.methods || {})[module], grid = (c.rubrics || {})[module];
  return html`${tips ? html`<details class="checklist method"><summary class="label">${t('exam.method')} · Méthode DELF ${c.exam ? c.exam.name.split(' ')[1] : ''}</summary><ul>${tips.map((tip) => html`<li>${tip}</li>`)}</ul></details>` : ''}
    ${grid ? html`<details class="checklist method"><summary class="label">${t('exam.grid')} · Grille</summary><dl class="grid-dl">${grid.map(([k, v]) => html`<dt lang="fr">${frText(k)}</dt><dd>${v}</dd>`)}</dl></details>` : ''}`;
}

/** Breadcrumb-style header of a page inside a day. */
export function crumbs(d, label, sub = '') {
  return html`<nav class="crumbs" aria-label="${t('common.crumbs')}">
    <a href="#/day/${d}" class="crumb-back">${icon('left')}<span>Jour ${pad2(d)}</span></a>
    <span class="crumb-sep">/</span><span>${label}</span>${sub ? html`<span class="crumb-sep">/</span><span class="muted">${sub}</span>` : ''}
  </nav>`;
}

/** Numbered pager across the items of a module; items beyond the plan are optional. */
export function pager(d, module, items, n, due, stateOf) {
  return html`<nav class="pager" aria-label="${moduleName(module)}">
    ${items.map((it, i) => {
      const st = stateOf(it);
      return html`<a href="#/day/${d}/${module}/${i + 1}" class="pager-item ${i + 1 === n ? 'on' : ''} ${st.done ? 'done' : st.started ? 'started' : ''} ${i >= due ? 'extra' : ''}" ${i >= due ? html`data-optional="${t('common.optional')}"` : ''} ${i + 1 === n ? 'aria-current="page"' : ''} title="${it.title}${i >= due ? ` · ${t('common.optional')}` : ''}">
        <span>${pad2(i + 1)}</span>${st.done ? icon('check') : ''}</a>`;
    })}
  </nav>`;
}

export function nextLink(d, module, n, count) {
  return n < count
    ? html`<a class="btn" href="#/day/${d}/${module}/${n + 1}">${t('common.next')} ${icon('right')}</a>`
    : html`<a class="btn" href="#/day/${d}">${t('common.backToday')} ${icon('right')}</a>`;
}

export const empty = (title, text) => html`<div class="empty"><p class="display-xs">${title}</p><p class="muted">${text}</p></div>`;

/** A stored recording: a button that fetches it from R2 once, then an audio player. */
export const clip = (players, id) => (players.get(id)
  ? html`<audio controls src="${players.get(id)}"></audio>`
  : html`<button class="chip" data-act="listen" data-clip="${id}">${icon('play')} ${t('common.playback')}</button>`);

export const listenAction = (players) => async (el) => {
  el.disabled = true;
  try {
    const blob = await download(el.dataset.clip);
    if (!blob) { el.outerHTML = String(html`<span class="tag soft">${t('common.clipUnavailable')}</span>`); return; }
    players.set(el.dataset.clip, URL.createObjectURL(blob));
    refresh();
  } catch (e) { el.disabled = false; }
};

/** What the learner types for a chunk: the marked part of its example. */
export const chunkGap = (ex) => (/\[\[(.+?)\]\]/.exec(ex) || [])[1] || '';
export const plainExample = (ex) => ex.replace(/\[\[|\]\]/g, '');

/** A chunk's example with the chunk shown, or with an input in its place. */
function chunkExample(ex, reveal, typed) {
  const m = /\[\[(.+?)\]\]/.exec(ex);
  if (!m) return frText(ex);
  const before = ex.slice(0, m.index), after = ex.slice(m.index + m[0].length);
  return html`${frText(before)}${reveal ? html`<mark class="chunk-hit">${frText(m[1])}</mark>`
    : html`<input class="gap-input" data-input="typed" value="${typed}" style="--w:${Math.min(28, Math.max(6, m[1].length + 2))}ch" lang="fr" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${t('recall.inputLabel')}">`}${frText(after)}`;
}

const SRC = { R: 'reading', L: 'listening', W: 'writing', S: 'speaking', A: 'application' };
export const chunkSource = (src) => (src && SRC[src[0]] && /^[RLWSA]\d/.test(src) ? `${moduleName(SRC[src[0]])} ${src.split('-')[1]}` : t('recall.topicChunk'));

/** The typed answer against the expected one, the part that differs marked (common start and end left plain). */
function diffLine(a, b) {
  let i = 0, j = 0;
  const x = a.toLowerCase(), y = b.toLowerCase();
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
  const part = (s, cls) => html`${s.slice(0, i)}<mark class="${cls}">${s.slice(i, s.length - j)}</mark>${s.slice(s.length - j)}`;
  return html`<p class="spell-diff" lang="fr"><span class="muted">${t('recall.youWrote')}</span><s>${part(a, 'bad')}</s><span class="muted">${t('recall.correctSpelling')}</span><b>${part(b, 'ok')}</b></p>`;
}

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'ë', 'œ'];

/**
 * Active recall by typing: the meaning (in the interface language) and the sentence with an input in place of the chunk.
 * The learner types the missing words; spelling (accents included) must be exact, spaces and case do not count.
 * `card` = {meta, typed, result: {ok, typed} | null}; a result shows the chunk, its sound and the translation.
 */
export function recallCard(c, card) {
  const gap = chunkGap(c.ex), r = card.result;
  return html`<section class="qcard recall ${r ? (r.ok ? 'open is-ok' : 'open is-bad') : ''}" data-key="c:${c.id}" data-state="${r ? (r.ok ? 'ok' : 'bad') : ''}" aria-live="polite">
    <p class="qcard-meta"><span>${card.meta || ''}</span><span class="tag">${chunkSource(c.src)}</span></p>
    <p class="recall-zh">${c.zh}</p>
    <p class="recall-ex" lang="fr">${chunkExample(c.ex, Boolean(r), card.typed || '')}</p>
    ${r ? html`
      <div class="recall-back">
        <p class="feedback-head">${r.ok ? t('recall.ok') : r.typed ? t('recall.bad') : t('recall.shown')}</p>
        ${!r.ok && r.typed ? diffLine(r.typed.trim(), gap) : ''}
        <p class="recall-fr" lang="fr">${frText(c.fr)}<button class="icon-btn" data-act="say" aria-label="${t('recall.say')}">${icon('play')}</button></p>
        <p class="muted">${c.exZh}</p>
      </div>
      <div class="qnav end"><button class="btn" data-act="next-chunk">${t('recall.next')} <kbd>Enter</kbd></button></div>`
    : html`<p class="hint">${t('recall.first')} <b lang="fr">${gap.trim()[0] || ''}</b> · ${t('recall.words', { n: gap.trim().split(/\s+/).length })}${t('punct.stop')}${t('recall.rule')}</p>
      <div class="accents" aria-label="${t('recall.accents')}">${ACCENTS.map((a) => html`<button type="button" class="chip fr" data-act="accent" data-c="${a}" lang="fr">${a}</button>`)}</div>
      <div class="qnav"><button class="btn ghost" data-act="give-up">${t('recall.giveUp')}</button><button class="btn" data-act="check">${t('recall.check')} <kbd>Enter</kbd></button></div>`}
  </section>`;
}

/** Wires the card's input after each paint: focus, and Enter to check. */
export function mountRecall(root, check) {
  const i = root.querySelector('.gap-input');
  if (!i) return;
  i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); check(); } };
  if (document.activeElement !== i) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); }
}

/** Inserts an accented letter at the caret of the card's input. */
export function insertAccent(el) {
  const i = document.querySelector('.gap-input');
  if (!i) return;
  i.setRangeText(el.dataset.c, i.selectionStart, i.selectionEnd, 'end');
  i.focus();
  i.dispatchEvent(new Event('input', { bubbles: true }));
}

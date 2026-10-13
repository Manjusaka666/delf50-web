/** Reading and listening: one text or recording with its questions. */
import { store, commit, refresh } from '../store.js';
import { itemState, questionState } from '../progress.js';
import { answerChoice } from '../state.js';
import { html, icon, pad2, frText, LETTERS, moduleName, moduleFr } from '../ui.js';
import { t } from '../i18n.js';
import * as speech from '../speech.js';
import { dayContext, crumbs, pager, nextLink, examNotes } from './common.js';

/**
 * A listening script drawn from the sentences it is read in: each turn of a
 * dialogue on its own line, each sentence a span the player highlights and
 * that can be clicked to hear it.
 */
function transcript(script) {
  const segs = speech.segments(script), paras = [];
  segs.forEach((s, i) => {
    const p = paras[s.para] || (paras[s.para] = []);
    const turn = p[s.turn] || (p[s.turn] = { dialogue: s.dialogue, speaker: s.speaker, parts: [] });
    turn.parts.push(html`<span class="s" data-s="${i}">${frText(s.text)}</span>`);
  });
  return html`<div class="prose script" lang="fr" data-script>${paras.map((p) => html`<p>${p.filter(Boolean).map((turn) =>
    html`<span class="turn ${turn.dialogue ? `spk spk-${turn.speaker}` : ''}">${turn.dialogue ? html`<span class="dash" aria-hidden="true">—</span> ` : ''}${turn.parts.map((x, k) => html`${k ? ' ' : ''}${x}`)}</span>`)}</p>`)}</div>`;
}

export async function textView(d, module, n) {
  const ctx = await dayContext(d);
  const items = ctx.day.items[module], due = ctx.plan[module].length;
  n = Math.min(Math.max(1, n), items.length);
  const item = items[n - 1], listening = module === 'listening';
  const ttsId = `${d}:${item.id}`;
  let showScript = !listening, off = null, offVoices = null;

  const player = () => {
    const x = speech.tts, mine = x.id === ttsId, st = mine ? x.state : 'idle';
    if (!speech.supported) return html`<div class="player" data-player><p class="muted">${t('player.unsupported')}</p></div>`;
    const total = mine ? x.total : speech.segments(item.script).length, at = mine ? x.at : 0;
    return html`<div class="player ${st}" data-player>
      <div class="player-main">
        <button class="play" data-act="toggle" aria-label="${st === 'playing' ? t('player.pause') : st === 'paused' ? t('player.resume') : t('player.play')}">${icon(st === 'playing' ? 'pause' : 'play')}</button>
        <div class="player-body">
          <p class="player-title" aria-live="polite">${st === 'idle' ? t('player.idle') : st === 'paused' ? t('player.paused') : t('player.playing')}
            ${st !== 'idle' ? html`<span class="player-at">${t('player.sentence', { at: at + 1, total })}</span>` : ''}</p>
          <div class="player-track" aria-hidden="true">${Array.from({ length: Math.max(1, total) }, (_, i) => html`<i class="${mine && st !== 'idle' && i < at ? 'on' : mine && st !== 'idle' && i === at ? 'now' : ''}"></i>`)}</div>
        </div>
      </div>
      <div class="player-tools">
        <div class="transport">
          <button class="icon-btn" data-act="sprev" aria-label="${t('player.prev')}" ${mine && at > 0 ? '' : 'disabled'}>${icon('back')}</button>
          <button class="icon-btn" data-act="srepeat" aria-label="${t('player.repeat')}" ${mine && st !== 'idle' ? '' : 'disabled'}>${icon('repeat')}</button>
          <button class="icon-btn" data-act="snext" aria-label="${t('player.next')}" ${mine && at < total - 1 ? '' : 'disabled'}>${icon('forward')}</button>
          ${st !== 'idle' ? html`<button class="icon-btn" data-act="stop" aria-label="${t('player.stop')}">${icon('stop')}</button>` : ''}
        </div>
        <div class="rates" role="radiogroup" aria-label="${t('player.speed')}">${speech.RATES.map((r) => html`<button role="radio" aria-checked="${x.rate === r}" class="${x.rate === r ? 'on' : ''}" data-act="rate" data-r="${r}">${r}×</button>`)}</div>
      </div>
      ${speech.hasFrench() ? html`<p class="player-foot muted small"><span>${t('player.voices', { n: speech.segments(item.script).some((s) => s.speaker === 1) ? 2 : 1 })}</span><span class="keys-hint">${t('player.keys')}</span></p>`
        : html`<p class="player-foot muted small">${t('player.noVoice')}</p>`}
    </div>`;
  };

  const question = (q, i) => {
    const s = questionState(store.S, module, d, item, i);
    return html`<li class="q ${s ? (s.correct ? 'is-ok' : 'is-bad') : ''}" data-key="q${i}" data-state="${s ? (s.correct ? 'ok' : 'bad') : ''}">
      <p class="q-stem" lang="fr"><span class="q-num">${i + 1}</span>${frText(q.stem)}</p>
      <div class="opts" role="group">
        ${q.options.map((o, k) => {
          const cls = s ? (k === q.answer ? 'right' : k === s.selected ? 'wrong' : 'dim') : '';
          return html`<button class="opt ${cls}" data-act="answer" data-q="${i}" data-i="${k}" ${s ? 'disabled' : ''} lang="fr">
            <span class="opt-key">${LETTERS[k]}</span><span class="opt-text">${frText(o)}</span>
            ${s && k === q.answer ? icon('check', 'opt-mark') : s && k === s.selected ? icon('cross', 'opt-mark') : ''}</button>`;
        })}
      </div>
      ${s && q.why ? html`<p class="why">${frText(q.why)}</p>` : ''}
    </li>`;
  };

  const render = () => {
    const st = itemState(store.S, module, d, item);
    const right = item.questions.filter((_, i) => { const s = questionState(store.S, module, d, item, i); return s && s.correct; }).length;
    return html`<article class="page text ${module}">
      ${crumbs(d, moduleName(module), `${pad2(n)} / ${pad2(items.length)}`)}
      ${pager(d, module, items, n, due, (it) => { const x = itemState(store.S, module, d, it); return { done: x.done, started: x.answered > 0 }; })}
      <div class="reader">
        <section class="passage">
          <p class="eyebrow">${moduleFr(module)}${item.meta ? ` · ${item.meta.genre}` : ''}${n > due ? ` · ${t('common.optional')}` : ''}</p>
          <h1 class="passage-title" lang="fr">${frText(item.title)}</h1>
          ${item.meta ? html`<p class="passage-meta"><span class="tag">${item.meta.domain}</span><span class="tag">${item.meta.level}</span>${item.meta.plays ? html`<span class="tag soft">${item.meta.plays === 1 ? t('text.playedOnce') : t('text.playedTwice')}</span>` : ''}</p>` : ''}
          ${listening ? player() : ''}
          ${listening ? html`<button class="btn ghost small" data-act="script" aria-expanded="${showScript}">${icon('eye')} ${showScript ? t('text.hideScript') : t('text.showScript')}</button>` : ''}
          ${listening ? (showScript ? transcript(item.script) : html`<p class="muted script-hint">${t('text.listenFirst')}</p>`)
            : html`<div class="prose" lang="fr">${item.text.map((p) => html`<p>${frText(p)}</p>`)}</div>`}
          ${item.source ? html`<p class="source">${t('common.source')} · ${item.source.url ? html`<a href="${item.source.url}" target="_blank" rel="noopener">${item.source.label}</a>` : item.source.label}</p>` : ''}
        </section>
        <section class="questions" aria-label="${t('text.questions')}">
          <header class="questions-head">
            <h2 class="section-title"><span>Questions</span>${t('text.comprehension')}</h2>
            <p class="score ${st.done ? 'done' : ''}">${st.done ? t('common.correctOf', { n: right, total: item.questions.length }) : t('common.answeredOf', { n: st.answered, total: item.questions.length })}</p>
          </header>
          <ol class="qs">${item.questions.map(question)}</ol>
          ${examNotes(module)}
          ${st.done ? html`<div class="qnav end">${nextLink(d, module, n, items.length)}</div>` : html`<p class="hint">${t('text.hint')}</p>`}
        </section>
      </div>
    </article>`;
  };

  // The player and the highlighted sentence are updated in place as the reading moves on.
  const follow = () => {
    const el = document.querySelector('[data-player]');
    if (el) {
      const act = el.contains(document.activeElement) && document.activeElement.dataset.act;
      el.outerHTML = String(player());
      const again = act && document.querySelector(`[data-player] [data-act="${act}"]:not(:disabled)`);
      if (again) again.focus({ preventScroll: true });
    }
    const x = speech.tts, mine = x.id === ttsId && x.state !== 'idle';
    const box = document.querySelector('[data-script]');
    if (!box) return;
    box.querySelectorAll('.s.now').forEach((s) => s.classList.remove('now'));
    if (!mine) return;
    const s = box.querySelector(`[data-s="${x.at}"]`);
    if (s) {
      s.classList.add('now');
      const r = s.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight - 90) s.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  return {
    title: `${moduleName(module)} · Jour ${d}`,
    render,
    mount: (root) => {
      if (listening && !off) { off = speech.onSpeech(follow); offVoices = speech.onVoices(follow); }
      if (listening) {
        follow();
        // A sentence of the transcript plays from there.
        const box = root.querySelector('[data-script]');
        if (box) box.onclick = (e) => { const s = e.target.closest('[data-s]'); if (s) speech.seek(Number(s.dataset.s), ttsId, item.script); };
      }
    },
    unmount: () => { if (off) off(); if (offVoices) offVoices(); off = offVoices = null; if (listening && speech.tts.id === ttsId) speech.stop(); },
    actions: {
      answer: (el) => {
        const q = Number(el.dataset.q), k = Number(el.dataset.i);
        commit((S) => answerChoice(S, module, d, item.id, q, k));
      },
      toggle: () => speech.toggle(ttsId, item.script),
      stop: () => speech.stop(),
      sprev: () => speech.prev(ttsId, item.script),
      snext: () => speech.next(ttsId, item.script),
      srepeat: () => speech.repeat(ttsId, item.script),
      rate: (el) => speech.setRate(Number(el.dataset.r)),
      script: () => { showScript = !showScript; refresh(); }
    },
    keys: (e) => {
      if (!listening || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !(document.activeElement && document.activeElement.closest('button, a'))) { e.preventDefault(); speech.toggle(ttsId, item.script); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); speech.prev(ttsId, item.script); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); speech.next(ttsId, item.script); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); speech.repeat(ttsId, item.script); }
    }
  };
}

/** Reading and listening: one text or recording with its questions. */
import { store, commit, refresh } from '../store.js';
import { itemState, questionState } from '../progress.js';
import { answerChoice } from '../state.js';
import { html, icon, pad2, frText, LETTERS, MODULE_NAMES, MODULE_FR } from '../ui.js';
import * as speech from '../speech.js';
import { dayContext, crumbs, pager, nextLink } from './common.js';

export async function textView(d, module, n) {
  const ctx = await dayContext(d);
  const items = ctx.day.items[module], due = ctx.plan[module].length;
  n = Math.min(Math.max(1, n), items.length);
  const item = items[n - 1], listening = module === 'listening';
  const ttsId = `${d}:${item.id}`;
  let showScript = !listening, off = null;

  const player = () => {
    const t = speech.tts, mine = t.id === ttsId, st = mine ? t.state : 'idle';
    if (!speech.supported) return html`<div class="player"><p class="muted">当前浏览器不支持法语语音合成，请使用最新版 Chrome、Edge 或 Safari，或直接阅读原文。</p></div>`;
    return html`<div class="player ${st}" data-player>
      <button class="play" data-act="${st === 'playing' ? 'pause' : 'play'}" aria-label="${st === 'playing' ? '暂停' : '播放'}">${icon(st === 'playing' ? 'pause' : 'play')}</button>
      <div class="player-body">
        <p class="player-title">${st === 'idle' ? '播放录音' : st === 'paused' ? '已暂停' : '正在播放'}</p>
        <div class="player-track" aria-hidden="true">${Array.from({ length: Math.max(1, mine ? t.total : 1) }, (_, i) => html`<i class="${mine && st !== 'idle' && i <= t.at ? 'on' : ''}"></i>`)}</div>
      </div>
      <div class="rates" role="radiogroup" aria-label="语速">${speech.RATES.map((r) => html`<button role="radio" aria-checked="${t.rate === r}" class="${t.rate === r ? 'on' : ''}" data-act="rate" data-r="${r}">${r}×</button>`)}</div>
      ${st !== 'idle' ? html`<button class="icon-btn" data-act="stop" aria-label="停止">${icon('stop')}</button>` : ''}
    </div>`;
  };

  const question = (q, i) => {
    const s = questionState(store.S, module, d, item, i);
    return html`<li class="q ${s ? (s.correct ? 'is-ok' : 'is-bad') : ''}">
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
    const body = listening ? item.script : item.text;
    return html`<article class="page text ${module}">
      ${crumbs(d, MODULE_NAMES[module], `${pad2(n)} / ${pad2(items.length)}`)}
      ${pager(d, module, items, n, due, (it) => { const x = itemState(store.S, module, d, it); return { done: x.done, started: x.answered > 0 }; })}
      <div class="reader">
        <section class="passage">
          <p class="eyebrow">${MODULE_FR[module]}${item.meta ? ` · ${item.meta.genre}` : ''}${n > due ? ' · 选做' : ''}</p>
          <h1 class="passage-title" lang="fr">${frText(item.title)}</h1>
          ${item.meta ? html`<p class="passage-meta"><span class="tag">${item.meta.domain}</span><span class="tag">${item.meta.level}</span></p>` : ''}
          ${listening ? player() : ''}
          ${listening ? html`<button class="btn ghost small" data-act="script">${icon('eye')} ${showScript ? '隐藏原文' : '显示原文'}</button>` : ''}
          ${showScript ? html`<div class="prose" lang="fr">${body.map((p) => html`<p>${frText(p)}</p>`)}</div>` : html`<p class="muted script-hint">先只听不看，作答后再对照原文。</p>`}
          ${item.source ? html`<p class="source">来源 · ${item.source.url ? html`<a href="${item.source.url}" target="_blank" rel="noopener">${item.source.label}</a>` : item.source.label}</p>` : ''}
        </section>
        <section class="questions" aria-label="问题">
          <header class="questions-head">
            <h2 class="section-title"><span>Questions</span>理解题</h2>
            <p class="score ${st.done ? 'done' : ''}">${st.done ? html`<b>${right}</b> / ${item.questions.length} 正确` : `${st.answered} / ${item.questions.length} 已答`}</p>
          </header>
          <ol class="qs">${item.questions.map(question)}</ol>
          ${st.done ? html`<div class="qnav end">${nextLink(d, module, n, items.length)}</div>` : html`<p class="hint">每题作答后立即显示解析，答案不可更改。</p>`}
        </section>
      </div>
    </article>`;
  };

  const repaintPlayer = () => {
    const el = document.querySelector('[data-player]');
    if (el) el.outerHTML = String(player());
  };

  return {
    title: `${MODULE_NAMES[module]} · Jour ${d}`,
    render,
    mount: () => { if (!off && listening) off = speech.onSpeech(repaintPlayer); },
    unmount: () => { if (off) off(); off = null; if (listening && speech.tts.id === ttsId) speech.stop(); },
    actions: {
      answer: (el) => {
        const q = Number(el.dataset.q), k = Number(el.dataset.i);
        commit((S) => answerChoice(S, module, d, item.id, q, k));
      },
      play: () => speech.play(ttsId, item.script),
      pause: () => speech.pause(),
      stop: () => speech.stop(),
      rate: (el) => speech.setRate(Number(el.dataset.r)),
      script: () => { showScript = !showScript; refresh(); }
    }
  };
}

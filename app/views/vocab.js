/** Chunks (词块): the day's lexical chunks, recalled from Chinese and a gapped sentence, then self-assessed. */
import { store, commit, refresh } from '../store.js';
import { chunkMark } from '../progress.js';
import { markChunk } from '../state.js';
import { html, icon, pad2, frText, MODULE_NAMES } from '../ui.js';
import * as speech from '../speech.js';
import { dayContext, crumbs, recallCard, plainExample } from './common.js';

export async function vocabView(d) {
  const ctx = await dayContext(d);
  const all = ctx.day.vocab;
  let revealed = false, cur = null;

  // Unseen chunks of the plan first, then those to see again, then the optional ones.
  const due = () => ctx.plan.vocab.length;
  function next() {
    const plan = all.slice(0, due()), rest = all.slice(due());
    return plan.find((c) => !chunkMark(store.S, d, c.id)) || plan.find((c) => chunkMark(store.S, d, c.id) === 'again')
      || rest.find((c) => !chunkMark(store.S, d, c.id)) || null;
  }
  const current = () => all.find((c) => c.id === cur) || next();

  const render = () => {
    const m = ctx.progress().modules.vocab, c = current();
    const marks = all.map((x) => chunkMark(store.S, d, x.id));
    const known = marks.filter((x) => x === 'known').length, again = marks.filter((x) => x === 'again').length;
    return html`<article class="page vocab">
      ${crumbs(d, MODULE_NAMES.vocab)}
      <header class="page-head">
        <p class="eyebrow">Lexique · ${ctx.day.topic}</p>
        <h1 class="display-s">${ctx.day.title}</h1>
        <p class="muted">今日 ${m.done} / ${m.total} 个 · 记住 ${known} · 再练 ${again}。词块来自当天的阅读、听力和写作口语任务，按"看中文和例句 → 说出法语 → 翻面核对"练习。</p>
      </header>
      <div class="split">
        <div>${c ? recallCard(c, revealed, `${c.id.slice(-2)} / ${pad2(all.length)}${all.indexOf(c) >= due() ? ' · 选做' : ''}`)
          : html`<section class="qcard done-card"><p class="display-xs">今天的词块都练过了</p><p class="muted">可以点右侧任意词块再看一遍，或回到今日继续其他模块。</p>
            <div class="qnav end"><a class="btn" href="#/day/${d}">回到今日 ${icon('right')}</a></div></section>`}</div>
        <aside class="side">
          <ol class="chunks-list">${all.map((x, i) => {
            const mk = marks[i];
            return html`<li><button class="chunk-row ${x.id === (c && c.id) ? 'on' : ''} ${mk || ''} ${i >= due() ? 'extra' : ''}" data-act="open" data-id="${x.id}">
              <span class="chunk-dot" aria-hidden="true"></span><span class="chunk-fr" lang="fr">${frText(x.fr)}</span><span class="chunk-zh">${x.zh}</span></button></li>`;
          })}</ol>
        </aside>
      </div>
    </article>`;
  };

  const mark = (v) => {
    const c = current();
    if (!c || !revealed) return;
    revealed = false; cur = null;
    commit((S) => markChunk(S, d, c.id, v));
  };
  const say = () => { const c = current(); if (c) speech.play(`chunk:${c.id}`, [c.fr + '.', plainExample(c.ex)]); };

  return {
    title: `词块 · Jour ${d}`,
    render,
    unmount: () => speech.stop(),
    actions: {
      reveal: () => { revealed = true; refresh(); say(); },
      known: () => mark('known'),
      again: () => mark('again'),
      say,
      open: (el) => { cur = el.dataset.id; revealed = Boolean(chunkMark(store.S, d, cur)); refresh(); scrollTo({ top: 0, behavior: 'smooth' }); }
    },
    keys: (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === ' ' || e.key === 'Enter') && !revealed) { e.preventDefault(); revealed = true; refresh(); say(); }
      else if (e.key === '1' && revealed) { e.preventDefault(); mark('known'); }
      else if (e.key === '2' && revealed) { e.preventDefault(); mark('again'); }
    }
  };
}


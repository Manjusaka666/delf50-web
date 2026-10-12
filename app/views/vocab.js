/** Chunks (词块): the day's lexical chunks, typed from the Chinese meaning and a gapped sentence, checked for spelling. */
import { store, commit, refresh } from '../store.js';
import { chunkMark } from '../progress.js';
import { markChunk, spelledRight } from '../state.js';
import { html, icon, pad2, frText, MODULE_NAMES } from '../ui.js';
import * as speech from '../speech.js';
import { dayContext, crumbs, recallCard, mountRecall, insertAccent, chunkGap, plainExample } from './common.js';

export async function vocabView(d) {
  const ctx = await dayContext(d);
  const all = ctx.day.vocab;
  let cur = null, typed = '', result = null;

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
        <p class="muted">今日 ${m.done} / ${m.total} 个 · 拼对 ${known} · 再练 ${again}。词块来自当天的阅读、听力和写作口语任务：看中文和例句，在空格处写出缺少的法语，系统核对拼写。</p>
      </header>
      <div class="split">
        <div>${c ? recallCard(c, { meta: `${c.id.slice(-2)} / ${pad2(all.length)}${all.indexOf(c) >= due() ? ' · 选做' : ''}`, typed, result })
          : html`<section class="qcard done-card"><p class="display-xs">今天的词块都拼对了</p><p class="muted">可以点右侧任意词块再写一遍，或回到今日继续其他模块。</p>
            <div class="qnav end"><a class="btn" href="#/day/${d}">回到今日 ${icon('right')}</a></div></section>`}</div>
        <aside class="side">
          <ol class="chunks-list">${all.map((x, i) => {
            const mk = marks[i];
            return html`<li><button class="chunk-row ${x.id === (c && c.id) ? 'on' : ''} ${mk || ''} ${i >= due() ? 'extra' : ''}" data-act="open" data-id="${x.id}">
              <span class="chunk-dot" aria-hidden="true"></span><span class="chunk-fr" lang="fr">${mk ? frText(x.fr) : '· · ·'}</span><span class="chunk-zh">${x.zh}</span></button></li>`;
          })}</ol>
        </aside>
      </div>
    </article>`;
  };

  const say = () => { const c = current(); if (c) speech.play(`chunk:${c.id}`, [c.fr + '.', plainExample(c.ex)]); };
  const settle = (ok) => {
    const c = current();
    if (!c || result) return;
    cur = c.id; result = { ok, typed };
    commit((S) => markChunk(S, d, c.id, ok ? 'known' : 'again'));
    say();
  };
  const check = () => { const c = current(); if (c && typed.trim()) settle(spelledRight(typed, chunkGap(c.ex))); };
  const reset = (id = null) => { cur = id; typed = ''; result = null; speech.stop(); refresh(); };

  return {
    title: `词块 · Jour ${d}`,
    render,
    mount: (root) => mountRecall(root, check),
    unmount: () => speech.stop(),
    inputs: { typed: (el) => { typed = el.value; } },
    actions: {
      check,
      'give-up': () => settle(false),
      'next-chunk': () => reset(),
      accent: insertAccent,
      say,
      open: (el) => { reset(el.dataset.id); scrollTo({ top: 0, behavior: 'smooth' }); }
    },
    keys: (e) => {
      if (e.key === 'Enter' && result && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); reset(); }
    }
  };
}

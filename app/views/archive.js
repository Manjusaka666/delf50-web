/** The archive: everything recorded on a day — answers, texts and recordings, with their times. */
import { store, refresh } from '../store.js';
import { getCourse, loadDay, node, loadQuestions } from '../course.js';
import { studyDays, itemState, questionState, chunkMark } from '../progress.js';
import { html, icon, pad2, frText, fmtDateTime, fmtDuration, LETTERS, moduleName } from '../ui.js';
import { t } from '../i18n.js';
import { empty, clip, listenAction } from './common.js';

export async function archiveView(d) {
  const course = getCourse();
  if (!d) return listView(course);
  const day = await loadDay(d);
  const players = new Map();
  // The questions answered on this day (grammar and review), as asked.
  const asked = () => [...Object.values(store.S.grammar).filter((g) => g.day === d).map((g) => g.contentId),
    ...Object.values(store.S.review).filter((r) => r.day === d && r.kind === 'g').map((r) => r.contentId)];
  let questions = await loadQuestions(asked());
  const srcChunks = new Map();
  for (const src of await Promise.all([...new Set(Object.values(store.S.review).filter((r) => r.day === d && r.kind === 'v').map((r) => r.src))].map(loadDay))) {
    for (const c of src.vocab) srcChunks.set(c.id, c);
  }

  const choices = (module) => day.items[module].map((it) => {
    const st = itemState(store.S, module, d, it);
    if (!st.answered) return '';
    return html`<div class="arc-item">
      <p class="arc-head"><a href="#/day/${d}/${module}/${day.items[module].indexOf(it) + 1}" lang="fr">${frText(it.title)}</a><span class="muted">${t('common.answeredOf', { n: st.answered, total: it.questions.length })}</span></p>
      <ol class="arc-qs">${it.questions.map((q, i) => {
        const s = questionState(store.S, module, d, it, i);
        return s ? html`<li class="${s.correct ? 'ok' : 'bad'}" lang="fr">${icon(s.correct ? 'check' : 'cross')}<span>${frText(q.stem)}<br><small>${LETTERS[s.selected]}. ${frText(q.options[s.selected])}${s.correct ? '' : html` → ${LETTERS[q.answer]}. ${frText(q.options[q.answer])}`}</small></span></li>` : '';
      })}</ol>
    </div>`;
  });

  const texts = (module) => store.S[module].filter((r) => r.day === d).map((r) => html`<details class="version">
    <summary><span lang="fr">${frText(r.title)}</span><span class="muted">${fmtDateTime(r.at)}${r.words != null ? ` · ${t('common.words', { n: r.words })}` : ''}</span></summary>
    <div class="prose small" lang="fr">${r.text.split(/\n+/).map((p) => html`<p>${p}</p>`)}</div>
  </details>`);

  const render = () => {
    const S = store.S;
    if (asked().some((id) => !questions.has(id))) loadQuestions(asked()).then((q) => { questions = q; refresh(); }, () => {});
    const grammar = Object.values(S.grammar).filter((g) => g.day === d && questions.has(g.contentId)).sort((a, b) => (a.answeredAt < b.answeredAt ? -1 : 1));
    const prodNodes = [...new Set(Object.keys(S.production).filter((k) => k.startsWith(`${d}:`)).map((k) => k.split(':')[1]))];
    const prod = prodNodes.map((id) => [node(id), Object.keys(S.production).filter((k) => k.startsWith(`${d}:${id}:`)).length]);
    const speaking = S.speaking.filter((r) => r.day === d);
    const chunks = day.vocab.filter((c) => chunkMark(S, d, c.id));
    const reviews = Object.values(S.review).filter((r) => r.day === d).sort((a, b) => (a.at < b.at ? -1 : 1));
    const qline = (q, sel, ok, at) => html`<li class="${ok ? 'ok' : 'bad'}" lang="fr">${icon(ok ? 'check' : 'cross')}<span>${frText(q.stem)}<br><small>${frText(q.options[sel])}${ok ? '' : html` → ${frText(q.options[q.answer])}`} · ${fmtDateTime(at)}</small></span></li>`;
    const sections = [
      grammar.length && html`<section><h2 class="section-title"><span>Grammaire</span>${moduleName('grammar')} <small>${t('common.correctOf', { n: grammar.filter((g) => g.correct).length, total: grammar.length })}</small></h2>
        <ol class="arc-qs">${grammar.map((g) => qline(questions.get(g.contentId), g.selectedIndex, g.correct, g.answeredAt))}</ol></section>`,
      prod.length && html`<section><h2 class="section-title"><span>Production</span>${moduleName('production')}</h2><p>${prod.map(([n, c]) => html`<span class="tag">${n ? n.name : ''} · ${t('archive.prompts', { n: c })}</span>`)}</p></section>`,
      ...['reading', 'listening'].map((m) => { const xs = choices(m).filter(String); return xs.length && html`<section><h2 class="section-title"><span>${m === 'reading' ? 'Lecture' : 'Écoute'}</span>${moduleName(m)}</h2>${xs}</section>`; }),
      ...['writing', 'application'].map((m) => { const xs = texts(m); return xs.length && html`<section><h2 class="section-title"><span>${m === 'writing' ? 'Écrit' : 'Interaction'}</span>${moduleName(m)}</h2>${xs}</section>`; }),
      speaking.length && html`<section><h2 class="section-title"><span>Oral</span>${moduleName('speaking')}</h2><ul class="rounds">${speaking.map((r) => html`<li class="round">
        <span class="round-when" lang="fr">${frText(r.title)}</span><span class="muted">${fmtDateTime(r.at)} · ${fmtDuration(r.sec)}</span>
        ${r.clip ? clip(players, r.clip) : html`<span class="tag soft">${t('common.timed')}</span>`}</li>`)}</ul></section>`,
      chunks.length && html`<section><h2 class="section-title"><span>Lexique</span>${moduleName('vocab')} <small>${t('archive.known', { n: chunks.filter((c) => chunkMark(S, d, c.id) === 'known').length, total: chunks.length })}</small></h2>
        <ul class="chunks-list static">${chunks.map((c) => html`<li><span class="chunk-row ${chunkMark(S, d, c.id)}"><span class="chunk-dot"></span><span class="chunk-fr" lang="fr">${frText(c.fr)}</span><span class="chunk-zh">${c.zh}</span></span></li>`)}</ul></section>`,
      reviews.length && html`<section><h2 class="section-title"><span>Révision</span>${moduleName('review')} <small>${reviews.filter((r) => r.correct).length} / ${reviews.length}</small></h2>
        <ol class="arc-qs">${reviews.map((r) => (r.kind === 'g' ? (questions.has(r.contentId) ? qline(questions.get(r.contentId), r.selectedIndex, r.correct, r.at) : '')
          : html`<li class="${r.correct ? 'ok' : 'bad'}" lang="fr">${icon(r.correct ? 'check' : 'cross')}<span>${srcChunks.has(r.contentId) ? frText(srcChunks.get(r.contentId).fr) : r.contentId} <small>· Jour ${r.src}</small><br><small>${r.correct ? t('archive.remembered') : t('archive.again')} · ${fmtDateTime(r.at)}</small></span></li>`))}</ol></section>`
    ].filter(Boolean);
    return html`<article class="page archive">
      <nav class="crumbs" aria-label="${t('common.crumbs')}"><a href="#/archive" class="crumb-back">${icon('left')}<span>${t('archive.back')}</span></a></nav>
      <header class="page-head">
        <p class="eyebrow">Archive · Jour ${pad2(d)}</p>
        <h1 class="display-s">${day.title}</h1>
        <p><a class="btn ghost small" href="#/day/${d}">${t('archive.open', { d })} ${icon('right')}</a></p>
      </header>
      ${sections.length ? sections : empty(t('archive.dayEmpty'), t('archive.dayEmptyNote'))}
    </article>`;
  };

  return {
    title: `${t('archive.back')} · Jour ${d}`,
    render,
    unmount: () => players.forEach((u) => URL.revokeObjectURL(u)),
    actions: {
      listen: listenAction(players)
    }
  };
}

function listView(course) {
  return {
    title: t('archive.title'),
    render: () => {
      const sd = studyDays(store.S).slice().reverse();
      return html`<article class="page archive">
        <header class="page-head">
          <p class="eyebrow">Archive</p>
          <h1 class="display-s">${t('archive.title')}</h1>
          <p class="muted">${t('archive.lead')}</p>
        </header>
        ${sd.length ? html`<ul class="arc-days">${sd.map((x) => html`<li><a href="#/archive/${x.day}" class="arc-day">
          <span class="arc-num">${pad2(x.day)}</span>
          <span class="arc-body"><b>${course.map[x.day - 1].title}</b><small>${t('archive.records', { n: x.records })}${x.last ? ` · ${t('archive.latest', { t: fmtDateTime(x.last) })}` : ''}</small></span>${icon('right')}</a></li>`)}</ul>`
          : empty(t('archive.empty'), t('archive.emptyNote'))}
      </article>`;
    }
  };
}

/** Progress across the course: completion per day, accuracy and output volume. */
import { store, refresh } from '../store.js';
import { getCourse, node, weakestNodes } from '../course.js';
import { studyDays, grammarAccuracy, choiceAccuracy, nodeMastery } from '../progress.js';
import { html, pct, pad2, fmtDateTime, ring, moduleName } from '../ui.js';
import { t } from '../i18n.js';
import { studiedProgress, levelLabel } from './common.js';

export async function progressView() {
  const course = getCourse();
  let data = await studiedProgress([store.S.day]);

  const render = () => {
    const S = store.S, sd = studyDays(S);
    if (sd.some((x) => !data.progress.has(x.day))) studiedProgress([S.day]).then((x) => { data = x; refresh(); }, () => {});
    const done = [...data.progress.values()].filter((p) => p.complete).length;
    const g = grammarAccuracy(S), r = choiceAccuracy(S, 'reading', data.days), l = choiceAccuracy(S, 'listening', data.days);
    const words = S.writing.reduce((n, x) => n + (x.words || 0), 0);
    const speakSec = S.speaking.reduce((n, x) => n + (x.sec || 0), 0);
    const mastery = nodeMastery(S);
    const known = Object.values(S.lexicon).filter((x) => x === 'known').length;
    const acc = (label, x) => html`<div class="acc">${ring(x.answered ? x.correct / x.answered : 0, 76)}<span class="acc-n">${x.answered ? pct(x.correct, x.answered) : '—'}<small>${x.answered ? '%' : ''}</small></span>
      <p>${label}</p><p class="muted small">${x.correct} / ${x.answered}</p></div>`;
    return html`<article class="page progress">
      <header class="page-head">
        <p class="eyebrow">Progression · ${levelLabel(S.intensity)}</p>
        <h1 class="display-s">${t('progress.title')}</h1>
        <p class="muted">${t('progress.lead')}</p>
      </header>
      <section class="stats">
        <div class="stat big"><b>${done}</b><span>/ ${course.days}</span><p>${t('progress.daysDone')}</p></div>
        <div class="stat"><b>${sd.length}</b><p>${t('progress.daysStudied')}</p></div>
        <div class="stat"><b>${words}</b><p>${t('progress.words')}</p></div>
        <div class="stat"><b>${Math.round(speakSec / 60)}</b><span>${t('progress.minutes')}</span><p>${t('progress.speaking')}</p></div>
        <div class="stat"><b>${known}</b>${t('progress.chunkUnit') ? html`<span>${t('progress.chunkUnit')}</span>` : ''}<p>${t('progress.chunks')}</p></div>
        <div class="stat"><b>${Object.keys(S.production).length * 2}</b>${t('progress.sentenceUnit') ? html`<span>${t('progress.sentenceUnit')}</span>` : ''}<p>${t('progress.production')}</p></div>
        <div class="stat"><b>${S.errors.length}</b><p>${t('progress.errors')}</p></div>
      </section>
      <section class="accs" aria-label="${t('progress.accuracy')}">${acc(moduleName('grammar'), g)}${acc(moduleName('reading'), r)}${acc(moduleName('listening'), l)}</section>
      ${mastery.length ? html`<section>
        <h2 class="section-title"><span>Points de grammaire</span>${t('progress.mastery')} <small>${t('progress.weakestFirst')}</small></h2>
        <p class="muted small">${t('progress.remedial', { list: weakestNodes(S).map((id) => node(id).name) })}</p>
        <ul class="mastery">${mastery.map((x) => html`<li style="--f:${x.correct / x.answered}"><span class="m-name" lang="fr">${node(x.id) ? node(x.id).name : x.id}</span>
          <span class="m-bar"><i></i></span><span class="m-n">${pct(x.correct, x.answered)}%<small> · ${x.correct}/${x.answered}</small></span></li>`)}</ul>
      </section>` : ''}
      <section>
        <h2 class="section-title"><span>Cinquante jours</span>${t('progress.fifty')}</h2>
        <div class="heat">${course.map.map((m) => {
          const p = data.progress.get(m.day), f = p ? p.fraction : 0;
          return html`<a href="#/day/${m.day}" class="heat-cell ${p && p.complete ? 'done' : ''} ${m.day === S.day ? 'now' : ''}" style="--f:${f}" title="Jour ${m.day} · ${m.title} · ${Math.round(f * 100)}%"><span>${m.day}</span></a>`;
        })}</div>
      </section>
      ${sd.length ? html`<section>
        <h2 class="section-title"><span>Journal</span>${t('progress.log')}</h2>
        <table class="table"><thead><tr>${['day', 'theme', 'done', 'first', 'last'].map((k) => html`<th scope="col">${t(`progress.col.${k}`)}</th>`)}</tr></thead>
        <tbody>${sd.slice().reverse().map((x) => {
          const p = data.progress.get(x.day);
          return html`<tr><td><a href="#/archive/${x.day}">Jour ${pad2(x.day)}</a></td><td>${course.map[x.day - 1].title}</td><td>${p ? Math.round(p.fraction * 100) + '%' : '—'}</td><td>${fmtDateTime(x.first)}</td><td>${fmtDateTime(x.last)}</td></tr>`;
        })}</tbody></table>
      </section>` : ''}
    </article>`;
  };

  return {
    title: t('progress.title'),
    render
  };
}

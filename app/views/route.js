/** The 50-day route: four phases, every day with its theme and grammar focus. */
import { store, refresh } from '../store.js';
import { getCourse } from '../course.js';
import { studyDays } from '../progress.js';
import { html, icon, pad2, frText } from '../ui.js';
import { studiedProgress } from './common.js';

export async function routeView() {
  const course = getCourse();
  let data = await studiedProgress([store.S.day]);

  const render = () => {
    const S = store.S;
    if (studyDays(S).some((x) => !data.progress.has(x.day))) studiedProgress([S.day]).then((x) => { data = x; refresh(); }, () => {});
    return html`<article class="page route">
      <header class="page-head">
        <p class="eyebrow">Itinéraire · ${course.days} jours</p>
        <h1 class="display-s">50 天路线</h1>
        <p class="muted">从句子骨架到模考修复，四个阶段循序推进。每一天的题目都是固定的，可随时回看任一天。</p>
      </header>
      ${course.phases.map((p, i) => html`<section class="phase">
        <header class="phase-head"><span class="phase-num">${pad2(i + 1)}</span><div><h2>${p.name}</h2><p class="muted">Jour ${p.from} – ${p.to}</p></div></header>
        <ol class="tiles">${course.map.slice(p.from - 1, p.to).map((m) => {
          const pr = data.progress.get(m.day), f = pr ? pr.fraction : 0;
          return html`<li><a href="#/day/${m.day}" class="tile ${m.day === S.day ? 'now' : ''} ${pr && pr.complete ? 'done' : ''}" style="--f:${f}">
            <span class="tile-num">${pad2(m.day)}</span>
            <span class="tile-title">${m.title}</span>
            <span class="tile-fr" lang="fr">${frText(m.grammarFocus)}</span>
            <span class="tile-foot"><span>${m.topic}</span><span>${m.level}</span></span>
            <span class="mod-bar"><i></i></span>
            ${pr && pr.complete ? html`<span class="mod-done">${icon('check')}</span>` : ''}
          </a></li>`;
        })}</ol>
      </section>`)}
    </article>`;
  };

  return { title: '50 天路线', render };
}

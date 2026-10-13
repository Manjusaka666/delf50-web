/** The guide: how the course works, the exam of its level, how it is graded, every grammar point, resources and sources. */
import { getCourse, allNodes } from '../course.js';
import { html, icon, frText, moduleName, moduleFr, unit } from '../ui.js';
import { t } from '../i18n.js';
import { levelLabel } from './common.js';

const METHOD = ['grammar', 'production', 'reading', 'listening', 'writing', 'speaking', 'application', 'vocab', 'review'];

export async function guideView() {
  const course = getCourse(), nodes = allNodes();
  return {
    title: t('guide.title'),
    render: () => html`<article class="page guide-page">
      <header class="page-head">
        <p class="eyebrow">Mode d’emploi</p>
        <h1 class="display-s">${t('guide.title')}</h1>
        <p class="lead">${course.intro || ''} ${t('guide.lead')}</p>
      </header>

      <section>
        <h2 class="section-title"><span>Intensité</span>${t('guide.intensity')}</h2>
        <div class="levels">${Object.keys(course.levels).map((k) => {
          const q = course.quotas[k];
          return html`<div class="level"><p class="level-name">${levelLabel(k)}</p>
            <p class="muted small">${METHOD.map((m) => `${moduleName(m)} ${q[m]} ${unit(m, q[m])}`).join(' · ')}</p></div>`;
        })}</div>
      </section>

      <section>
        <h2 class="section-title"><span>Méthode</span>${t('guide.method')}</h2>
        <ul class="method">${METHOD.map((k) => html`<li><span class="mod-icon">${icon(k)}</span><div><p><b>${moduleName(k)}</b> <span class="muted" lang="fr">${moduleFr(k)}</span></p><p class="muted">${t(`guide.m.${k}`)}</p></div></li>`)}</ul>
      </section>

      ${course.exam ? html`<section>
        <h2 class="section-title"><span>L’examen</span>${t('guide.exam', { name: course.exam.name })}</h2>
        <div class="exam">${course.exam.parts.map(([fr, name, time, d]) => html`<div class="exam-part"><p class="eyebrow" lang="fr">${fr}</p><p class="exam-name">${name}<span>${time} · ${t('guide.points')}</span></p><p class="muted">${d}</p></div>`)}</div>
        <p class="muted small">${course.exam.rule}</p>
      </section>` : ''}

      ${course.rubrics ? html`<section>
        <h2 class="section-title"><span>Évaluation</span>${t('guide.grids')}</h2>
        <div class="exam">${[['writing', `${t('guide.gridWriting')} · Production écrite`], ['speaking', `${t('guide.gridSpeaking')} · Production orale`]].map(([k, title]) => html`<div class="exam-part"><p class="eyebrow">${title}</p>
          <dl class="grid-dl">${course.rubrics[k].map(([c, d]) => html`<dt lang="fr">${frText(c)}</dt><dd>${d}</dd>`)}</dl></div>`)}</div>
        <p class="muted small">${t('guide.gridsNote')}</p>
      </section>` : ''}

      ${course.resources ? html`<section>
        <h2 class="section-title"><span>Ressources</span>${t('guide.resources')}</h2>
        <ul class="sources">${course.resources.map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener">${r.name}</a><span class="muted">${r.skill ? moduleName(r.skill) : ''} · ${r.note}</span></li>`)}</ul>
      </section>` : ''}

      <section>
        <h2 class="section-title"><span>Grammaire</span>${t('guide.grammar')} <small>${t('guide.nodes', { n: nodes.length })}</small></h2>
        <ul class="nodes">${nodes.map((n) => html`<li><a href="#/day/${n.firstDay}/grammar"><span class="tag">${n.level}</span><b lang="fr">${frText(n.name)}</b><span class="muted">${n.use || ''}</span><small>Jour ${n.firstDay}</small></a></li>`)}</ul>
      </section>

      <section>
        <h2 class="section-title"><span>Sources</span>${t('guide.sources')}</h2>
        <ul class="sources">${course.sources.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a><span class="muted">${s.note || ''}</span></li>`)}</ul>
      </section>
    </article>`
  };
}

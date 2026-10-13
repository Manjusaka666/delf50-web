/** A day: what is due at the chosen intensity, and how much of it is done. */
import { store, commit } from '../store.js';
import { getCourse, prefetch, MODULES } from '../course.js';
import { itemState, grammarAnswer } from '../progress.js';
import { setIntensity, INTENSITIES } from '../state.js';
import { html, icon, matisse, pad2, frText, moduleName, moduleFr, unit } from '../ui.js';
import { t } from '../i18n.js';
import { dayContext, levelLabel } from './common.js';

export async function dayView(d) {
  const ctx = await dayContext(d);
  prefetch(d);
  const course = getCourse();

  function firstOpen(module) {
    if (module === 'production') return `#/day/${d}/grammar/production`;
    if (module === 'vocab' || module === 'review') return `#/day/${d}/${module}`;
    if (module === 'grammar') {
      const i = ctx.plan.grammar.findIndex((q) => !grammarAnswer(store.S, d, q));
      return `#/day/${d}/grammar${i > 0 ? '/' + (i + 1) : ''}`;
    }
    const items = ctx.plan[module];
    const i = items.findIndex((it) => !itemState(store.S, module, d, it).done);
    return `#/day/${d}/${module}/${(i < 0 ? 0 : i) + 1}`;
  }

  const card = (module, m, extra = '') => {
    const done = m.done >= m.total;
    return html`<a class="mod ${done ? 'done' : m.done ? 'started' : ''}" href="${firstOpen(module)}" data-key="m:${module}" data-state="${done ? 'done' : ''}" style="--f:${m.total ? m.done / m.total : 1}">
      <span class="mod-icon">${icon(module)}</span>
      <span class="mod-fr">${moduleFr(module)}</span>
      <span class="mod-name">${moduleName(module)}</span>
      <span class="mod-count"><b>${m.done}</b><span>/ ${m.total} ${unit(module, m.total)}</span></span>
      ${extra}
      <span class="mod-bar"><i></i></span>
      ${done ? html`<span class="mod-done">${icon('check')}</span>` : ''}
    </a>`;
  };

  const render = () => {
    const { day } = ctx, pr = ctx.progress(), m = pr.modules;
    const phaseIndex = course.phases.findIndex((p) => d >= p.from && d <= p.to);
    const notes = ['canDo', 'review', 'input', 'output', 'checkpoint', 'challenge'].filter((k) => day[k]).map((k) => [t(`day.${k}`), day[k]]);
    return html`<article class="page day">
      <header class="hero">
        <div class="hero-text">
          <p class="eyebrow">Jour ${d} sur ${course.days} · ${day.phase} · ${day.level}</p>
          <p class="hero-num" aria-hidden="true">Jour ${pad2(d)}</p>
          <h1 class="display-s">${day.title}</h1>
          <p class="hero-fr">${frText(day.grammarFocus)}</p>
          <p class="hero-meta"><span class="tag">${day.topic}</span><span class="tag">${day.function}</span></p>
        </div>
        <div class="hero-art">${matisse(d)}
          <div class="hero-progress" role="img" aria-label="${t('day.progressAria', { n: Math.round(pr.fraction * 100) })}"><b>${Math.round(pr.fraction * 100)}<small>%</small></b><span class="hero-state">${pr.complete ? t('day.complete') : t('day.progress')}</span>
            <span class="line"><i data-key="day-line" style="--f:${pr.fraction}"></i></span></div>
        </div>
        <ol class="phases" aria-label="${t('day.phases')}">${course.phases.map((p, i) => html`<li class="${i === phaseIndex ? 'on' : i < phaseIndex ? 'past' : ''}" style="--w:${p.to - p.from + 1}">
          <span>${p.name}</span>${i === phaseIndex ? html`<i style="--at:${(d - p.from + 0.5) / (p.to - p.from + 1)}"></i>` : ''}</li>`)}</ol>
      </header>

      <section class="bar">
        <div class="seg" role="radiogroup" aria-label="${t('day.intensity')}">
          ${INTENSITIES.map((k) => html`<button role="radio" aria-checked="${store.S.intensity === k}" class="${store.S.intensity === k ? 'on' : ''}" data-act="intensity" data-v="${k}">${levelLabel(k)}</button>`)}
        </div>
        <p class="muted small">${t('day.intensityNote')}</p>
      </section>

      <section class="mods" aria-label="${t('day.modules')}">
        ${card('grammar', m.grammar)}
        ${card('production', m.production)}
        ${MODULES.filter((k) => k !== 'grammar').map((k) => card(k, m[k]))}
        ${card('vocab', m.vocab)}
        ${card('review', m.review)}
      </section>

      <section class="notes">
        <h2 class="section-title"><span>Feuille de route</span>${t('day.notes')}</h2>
        <dl>${notes.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      </section>

      <nav class="daynav" aria-label="${t('day.nav')}">
        ${d > 1 ? html`<a href="#/day/${d - 1}" class="daynav-a">${icon('left')}<span><small>Jour ${pad2(d - 1)}</small>${course.map[d - 2].title}</span></a>` : html`<span></span>`}
        ${d < course.days ? html`<a href="#/day/${d + 1}" class="daynav-a next"><span><small>Jour ${pad2(d + 1)}</small>${course.map[d].title}</span>${icon('right')}</a>` : html`<span></span>`}
      </nav>
    </article>`;
  };

  return {
    title: `Jour ${d}`,
    render,
    actions: {
      intensity: (el) => commit((S) => setIntensity(S, el.dataset.v))
    }
  };
}

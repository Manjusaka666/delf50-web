/** A day: what is due at the chosen intensity, and how much of it is done. */
import { store, commit } from '../store.js';
import { getCourse, prefetch, MODULES } from '../course.js';
import { itemState, grammarAnswer } from '../progress.js';
import { setIntensity, INTENSITIES } from '../state.js';
import { html, icon, ring, pad2, frText, MODULE_NAMES, MODULE_FR, UNITS } from '../ui.js';
import { dayContext } from './common.js';

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
    return html`<a class="mod ${done ? 'done' : m.done ? 'started' : ''}" href="${firstOpen(module)}" style="--f:${m.total ? m.done / m.total : 1}">
      <span class="mod-icon">${icon(module)}</span>
      <span class="mod-fr">${MODULE_FR[module]}</span>
      <span class="mod-name">${MODULE_NAMES[module]}</span>
      <span class="mod-count"><b>${m.done}</b><span>/ ${m.total} ${UNITS[module]}</span></span>
      ${extra}
      <span class="mod-bar"><i></i></span>
      ${done ? html`<span class="mod-done">${icon('check')}</span>` : ''}
    </a>`;
  };

  const render = () => {
    const { day } = ctx, pr = ctx.progress(), m = pr.modules;
    const phaseIndex = course.phases.findIndex((p) => d >= p.from && d <= p.to);
    const notes = [['能做到', day.canDo], ['复习', day.review], ['输入', day.input], ['输出', day.output], ['检查点', day.checkpoint]].filter((x) => x[1]);
    return html`<article class="page day">
      <header class="hero">
        <div class="hero-num" aria-hidden="true"><span>${pad2(d)}</span></div>
        <div class="hero-body">
          <p class="eyebrow">Jour ${d} sur ${course.days} · ${day.phase} · ${day.level}</p>
          <h1 class="display">${day.title}</h1>
          <p class="hero-fr">${frText(day.grammarFocus)}</p>
          <p class="hero-meta"><span class="tag">${day.topic}</span><span class="tag">${day.function}</span></p>
        </div>
        <div class="hero-ring">${ring(pr.fraction, 132, `今日完成 ${Math.round(pr.fraction * 100)}%`)}<span class="hero-pct"><b>${Math.round(pr.fraction * 100)}</b>%</span>
          <span class="hero-state">${pr.complete ? '今日已完成' : '今日完成度'}</span></div>
        <ol class="phases" aria-label="阶段">${course.phases.map((p, i) => html`<li class="${i === phaseIndex ? 'on' : i < phaseIndex ? 'past' : ''}" style="--w:${p.to - p.from + 1}">
          <span>${p.name}</span>${i === phaseIndex ? html`<i style="--at:${(d - p.from + 0.5) / (p.to - p.from + 1)}"></i>` : ''}</li>`)}</ol>
      </header>

      <section class="bar">
        <div class="seg" role="radiogroup" aria-label="学习强度">
          ${INTENSITIES.map((k) => html`<button role="radio" aria-checked="${store.S.intensity === k}" class="${store.S.intensity === k ? 'on' : ''}" data-act="intensity" data-v="${k}">${course.levels[k].label}</button>`)}
        </div>
        <p class="muted small">强度只决定当天需要完成多少；题目固定不变，超出部分可选做。</p>
      </section>

      <section class="mods" aria-label="今日模块">
        ${card('grammar', m.grammar)}
        ${card('production', m.production)}
        ${MODULES.filter((k) => k !== 'grammar').map((k) => card(k, m[k]))}
        ${card('vocab', m.vocab)}
        ${card('review', m.review)}
      </section>

      <section class="notes">
        <h2 class="section-title"><span>Feuille de route</span>今日要点</h2>
        <dl>${notes.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      </section>

      <nav class="daynav" aria-label="切换日期">
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

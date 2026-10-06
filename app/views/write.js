/** Writing and application: a task, a draft saved as it is typed, and the submitted versions. */
import { store, commit, refresh } from '../store.js';
import { itemState } from '../progress.js';
import { saveDraft, submitText, draftKey, countWords } from '../state.js';
import { html, icon, pad2, frText, fmtDateTime, MODULE_NAMES, MODULE_FR } from '../ui.js';
import { dayContext, crumbs, pager, nextLink } from './common.js';

export async function writeView(d, module, n) {
  const ctx = await dayContext(d);
  const items = ctx.day.items[module], due = ctx.plan[module].length;
  n = Math.min(Math.max(1, n), items.length);
  const item = items[n - 1], writing = module === 'writing', key = draftKey(d, item.id);
  let confirmShort = false;

  const draft = () => store.S.drafts[module][key] || '';
  const norm = (t) => t.toLowerCase().replace(/’/g, "'");
  const keyHits = (text) => (item.keys || []).map((k) => [k, norm(text).includes(norm(k))]);

  const meter = (text) => {
    const w = countWords(text);
    if (writing) return html`<span class="meter ${w >= item.minWords ? 'ok' : ''}" style="--f:${Math.min(1, w / item.minWords)}"><i></i><b>${w}</b> / ${item.minWords} 词</span>`;
    return html`<span class="meter plain"><b>${w}</b> 词</span>`;
  };
  const keysLine = (text) => html`<span class="keys">${keyHits(text).map(([k, on]) => html`<span class="key ${on ? 'on' : ''}" lang="fr">${on ? icon('check') : ''}${k}</span>`)}</span>`;

  const render = () => {
    const st = itemState(store.S, module, d, item), text = draft();
    return html`<article class="page write ${module}">
      ${crumbs(d, MODULE_NAMES[module], `${pad2(n)} / ${pad2(items.length)}`)}
      ${pager(d, module, items, n, due, (it) => ({ done: itemState(store.S, module, d, it).done, started: Boolean(store.S.drafts[module][draftKey(d, it.id)]) }))}
      <div class="task">
        <section class="brief">
          <p class="eyebrow">${MODULE_FR[module]}${n > due ? ' · 选做' : ''}</p>
          <h1 class="passage-title" lang="fr">${frText(item.title)}</h1>
          <p class="consigne" lang="fr">${frText(writing ? item.prompt : item.task)}</p>
          ${item.chunks && item.chunks.length ? html`<div class="chunks"><p class="label">可用表达 · 点击插入</p>${item.chunks.map((c) => html`<button class="chip fr" data-act="insert" data-t="${c}" lang="fr">${frText(c)}</button>`)}</div>` : ''}
          ${item.checklist && item.checklist.length ? html`<div class="checklist"><p class="label">提交前自查</p><ul>${item.checklist.map((c) => html`<li lang="fr">${frText(c)}</li>`)}</ul></div>` : ''}
        </section>
        <section class="editor">
          <label class="label" for="ed">${st.done ? '再写一版' : '你的回答'}</label>
          <textarea id="ed" class="ed" data-input="draft" lang="fr" spellcheck="true" placeholder="${writing ? 'Rédigez votre texte ici…' : 'Écrivez ce que vous diriez…'}">${text}</textarea>
          <div class="ed-foot">
            <span data-meter>${meter(text)}</span>
            ${item.keys && item.keys.length ? html`<span data-keys>${keysLine(text)}</span>` : ''}
            <span class="muted small">草稿随输入实时保存</span>
          </div>
          ${confirmShort ? html`<p class="notice">还不到 ${item.minWords} 词。DELF 写作字数不足会扣分，确定先提交这一版吗？</p>` : ''}
          <div class="row gap end">
            <button class="btn" data-act="submit" ${text.trim() ? '' : 'disabled'}>${confirmShort ? '仍然提交' : '提交'}</button>
          </div>
        </section>
      </div>
      ${st.records.length ? html`<section class="versions">
        <h2 class="section-title"><span>Versions</span>已提交 <small>${st.records.length} 版</small></h2>
        ${st.records.slice().reverse().map((r, i) => html`<details class="version" ${i === 0 ? 'open' : ''}>
          <summary><span>${fmtDateTime(r.at)}</span>${r.words != null ? html`<span class="muted">${r.words} 词</span>` : ''}</summary>
          <div class="prose small" lang="fr">${r.text.split(/\n+/).map((p) => html`<p>${p}</p>`)}</div>
        </details>`)}
        <div class="qnav end">${nextLink(d, module, n, items.length)}</div>
      </section>` : ''}
    </article>`;
  };

  const update = (text) => {
    const m = document.querySelector('[data-meter]'), k = document.querySelector('[data-keys]'), b = document.querySelector('[data-act="submit"]');
    if (m) m.innerHTML = String(meter(text));
    if (k) k.innerHTML = String(keysLine(text));
    if (b) b.disabled = !text.trim();
  };

  return {
    title: `${MODULE_NAMES[module]} · Jour ${d}`,
    render,
    inputs: {
      draft: (el) => { confirmShort = false; commit((S) => saveDraft(S, module, d, item.id, el.value), { quiet: true }); update(el.value); }
    },
    actions: {
      insert: (el) => {
        const ta = document.getElementById('ed'), t = el.dataset.t, a = ta.selectionStart, b = ta.selectionEnd;
        const pre = ta.value.slice(0, a), sep = pre && !/\s$/.test(pre) ? ' ' : '';
        ta.setRangeText(sep + t, a, b, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      },
      submit: () => {
        const text = draft();
        if (!text.trim()) return;
        if (writing && !confirmShort && countWords(text) < item.minWords) { confirmShort = true; refresh(); return; }
        confirmShort = false;
        commit((S) => submitText(S, module, d, item, text));
      }
    }
  };
}

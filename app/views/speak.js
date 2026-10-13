/** Speaking: a task, a typed outline or script, a timed recording stored in R2 (or a timed offline round), and the rounds done. */
import { store, commit, refresh } from '../store.js';
import { itemState } from '../progress.js';
import { loadDay } from '../course.js';
import { addSpeaking, saveDraft, draftKey, countWords } from '../state.js';
import { upload, newClipId } from '../media.js';
import { html, icon, pad2, frText, fmtDateTime, fmtDuration, moduleName, moduleFr } from '../ui.js';
import { t } from '../i18n.js';
import { dayContext, crumbs, pager, nextLink, clip, listenAction, triggerDoc, examNotes } from './common.js';

const MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
const canRecord = typeof MediaRecorder !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

export async function speakView(d, n) {
  const ctx = await dayContext(d);
  const items = ctx.day.items.speaking, due = ctx.plan.speaking.length;
  n = Math.min(Math.max(1, n), items.length);
  const item = items[n - 1];
  // The point of view (DELF part 3) starts from a short document: a reading of this or an earlier day.
  const docDay = item.doc ? Number(item.doc.slice(1, 3)) : 0;
  const doc = item.doc ? (await loadDay(docDay)).items.reading.find((r) => r.id === item.doc) : null;

  // recorder: idle → recording|timing → review (recording) → saving → idle
  let mode = 'idle', started = 0, elapsed = 0, tick = 0, rec = null, stream = null, chunks = [], take = null, error = '';
  const players = new Map();

  const clock = () => html`<span class="clock ${elapsed >= item.targetSeconds ? 'ok' : ''}"><b data-clock>${fmtDuration(elapsed)}</b> / ${fmtDuration(item.targetSeconds)}</span>`;
  const setClock = () => { const c = document.querySelector('[data-clock]'); if (c) c.textContent = fmtDuration(elapsed); const r = document.querySelector('[data-arc]'); if (r) r.style.setProperty('--f', Math.min(1, elapsed / item.targetSeconds)); };

  function stopTracks() { if (stream) stream.getTracks().forEach((track) => track.stop()); stream = null; }
  function startClock() { started = Date.now(); elapsed = 0; clearInterval(tick); tick = setInterval(() => { elapsed = (Date.now() - started) / 1000; setClock(); }, 250); }

  async function record() {
    error = '';
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { error = t('speak.micError'); refresh(); return; }
    const type = MIME.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stopTracks();
      const blob = new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] });
      take = { blob, url: URL.createObjectURL(blob), sec: elapsed };
      mode = 'review'; refresh();
    };
    rec.start(1000);
    mode = 'recording'; startClock(); refresh();
  }

  function finish() {
    clearInterval(tick); elapsed = (Date.now() - started) / 1000;
    if (mode === 'recording') rec.stop();
    else if (mode === 'timing') { commit((S) => addSpeaking(S, d, item, null, elapsed)); mode = 'idle'; }
  }

  function discard() { if (take) URL.revokeObjectURL(take.url); take = null; mode = 'idle'; refresh(); }

  async function keep() {
    const tk = take, id = newClipId();
    mode = 'saving'; refresh();
    await upload(id, tk.blob);
    commit((S) => addSpeaking(S, d, item, id, tk.sec));
    URL.revokeObjectURL(tk.url); take = null; mode = 'idle'; refresh();
  }

  const recorder = () => {
    if (mode === 'review') return html`<div class="recorder review">
      <audio controls src="${take.url}"></audio>
      <p class="muted">${t('speak.review', { d: fmtDuration(take.sec) })}</p>
      <div class="row gap"><button class="btn ghost" data-act="discard">${t('speak.redo')}</button><button class="btn" data-act="keep">${t('speak.keep')}</button></div>
    </div>`;
    if (mode === 'saving') return html`<div class="recorder"><p class="saving-line" role="status"><i class="dot saving"></i>${t('speak.uploading')}</p></div>`;
    const live = mode === 'recording' || mode === 'timing';
    return html`<div class="recorder ${live ? 'live' : ''}">
      <div class="arc" data-arc style="--f:${Math.min(1, elapsed / item.targetSeconds)}">
        ${live ? html`<button class="rec-btn stop" data-act="finish" aria-label="${t('speak.stop')}">${icon('stop')}</button>`
          : html`<button class="rec-btn" data-act="record" aria-label="${t('speak.start')}" ${canRecord ? '' : 'disabled'}>${icon('record')}</button>`}
      </div>
      ${clock()}
      <p class="muted small" aria-live="polite">${mode === 'recording' ? t('speak.recording') : mode === 'timing' ? t('speak.timing') : canRecord ? t('speak.ready') : t('speak.cannot')}</p>
      ${live ? '' : html`<button class="btn ghost small" data-act="timer">${t('speak.timer')}</button>`}
      ${error ? html`<p class="notice bad">${error}</p>` : ''}
    </div>`;
  };

  const roundItem = (r) => html`<li class="round">
    <span class="round-when">${fmtDateTime(r.at)}</span><span class="muted">${fmtDuration(r.sec)}</span>
    ${r.clip ? clip(players, r.clip) : html`<span class="tag soft">${t('common.timed')}</span>`}
    ${r.notes ? html`<details class="round-notes"><summary>${t('speak.notesThen')}</summary><div class="prose small" lang="fr">${r.notes.split(/\n+/).map((p) => html`<p>${p}</p>`)}</div></details>` : ''}
  </li>`;

  const key = draftKey(d, item.id), notes = () => store.S.drafts.speaking[key] || '';
  const notesBox = () => html`<div class="notes">
    <label class="label" for="notes">${t('speak.notes')} · Plan</label>
    <textarea id="notes" class="ed notes-ed" data-input="notes" lang="fr" spellcheck="true" placeholder="Notez votre plan ou rédigez ce que vous allez dire…">${notes()}</textarea>
    <div class="ed-foot"><span class="meter plain"><b data-notes-words>${countWords(notes())}</b> <span data-notes-unit>${t('common.wordUnit', { n: countWords(notes()) })}</span></span><span class="muted small">${t('speak.notesNote')}</span></div>
  </div>`;

  const render = () => {
    const st = itemState(store.S, 'speaking', d, item);
    return html`<article class="page speak">
      ${crumbs(d, moduleName('speaking'), `${pad2(n)} / ${pad2(items.length)}`)}
      ${pager(d, 'speaking', items, n, due, (it) => ({ done: itemState(store.S, 'speaking', d, it).done }))}
      <div class="task">
        <section class="brief">
          <p class="eyebrow">${moduleFr('speaking')} · ${item.part}${n > due ? ` · ${t('common.optional')}` : ''}</p>
          <h1 class="passage-title" lang="fr">${frText(item.title)}</h1>
          <p class="consigne" lang="fr">${frText(item.prompt)}</p>
          ${triggerDoc(item.trigger)}
          ${item.followUps && item.followUps.length ? html`<div class="checklist"><p class="label">${t('speak.followUps')} · Relances</p><ol>${item.followUps.map((q) => html`<li lang="fr">${frText(q)}</li>`)}</ol></div>` : ''}
          ${doc ? html`<a class="doc-link" href="#/day/${docDay}/reading/${Number(item.doc.split('-')[1])}">${icon('reading')}<span><small>${t('speak.doc', { d: docDay })}</small><span lang="fr">${frText(doc.title)}</span></span>${icon('right')}</a>` : ''}
          ${item.checklist && item.checklist.length ? html`<div class="checklist"><p class="label">${t('speak.checklist')}</p><ul>${item.checklist.map((c) => html`<li lang="fr">${frText(c)}</li>`)}</ul></div>` : ''}
          ${examNotes('speaking')}
        </section>
        <section class="editor">${notesBox()}${recorder()}</section>
      </div>
      ${st.records.length ? html`<section class="versions">
        <h2 class="section-title"><span>Prises</span>${t('speak.done')} <small>${t('speak.rounds', { n: st.records.length })}</small></h2>
        <ul class="rounds">${st.records.slice().reverse().map(roundItem)}</ul>
        <div class="qnav end">${nextLink(d, 'speaking', n, items.length)}</div>
      </section>` : ''}
    </article>`;
  };

  return {
    title: `${moduleName('speaking')} · Jour ${d}`,
    render,
    unmount: () => {
      clearInterval(tick);
      if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
      stopTracks();
      if (take) URL.revokeObjectURL(take.url);
      players.forEach((u) => u && URL.revokeObjectURL(u));
    },
    inputs: {
      notes: (el) => {
        commit((S) => saveDraft(S, 'speaking', d, item.id, el.value), { quiet: true });
        const w = document.querySelector('[data-notes-words]');
        const n = countWords(el.value), u = document.querySelector('[data-notes-unit]');
        if (w) w.textContent = n;
        if (u) u.textContent = t('common.wordUnit', { n });
      }
    },
    actions: {
      record,
      finish,
      discard,
      keep,
      timer: () => { error = ''; mode = 'timing'; startClock(); refresh(); },
      listen: listenAction(players)
    }
  };
}

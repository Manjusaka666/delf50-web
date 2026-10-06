/** Speaking: a task, a timed recording stored in R2 (or a timed offline round), and the rounds done. */
import { store, commit, refresh } from '../store.js';
import { itemState } from '../progress.js';
import { addSpeaking } from '../state.js';
import { upload, newClipId } from '../media.js';
import { html, icon, pad2, frText, fmtDateTime, fmtDuration, MODULE_NAMES, MODULE_FR } from '../ui.js';
import { dayContext, crumbs, pager, nextLink, clip, listenAction } from './common.js';

const MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
const canRecord = typeof MediaRecorder !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

export async function speakView(d, n) {
  const ctx = await dayContext(d);
  const items = ctx.day.items.speaking, due = ctx.plan.speaking.length;
  n = Math.min(Math.max(1, n), items.length);
  const item = items[n - 1];

  // recorder: idle → recording|timing → review (recording) → saving → idle
  let mode = 'idle', started = 0, elapsed = 0, tick = 0, rec = null, stream = null, chunks = [], take = null, error = '';
  const players = new Map();

  const clock = () => html`<span class="clock ${elapsed >= item.targetSeconds ? 'ok' : ''}"><b data-clock>${fmtDuration(elapsed)}</b> / ${fmtDuration(item.targetSeconds)}</span>`;
  const setClock = () => { const c = document.querySelector('[data-clock]'); if (c) c.textContent = fmtDuration(elapsed); const r = document.querySelector('[data-arc]'); if (r) r.style.setProperty('--f', Math.min(1, elapsed / item.targetSeconds)); };

  function stopTracks() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }
  function startClock() { started = Date.now(); elapsed = 0; clearInterval(tick); tick = setInterval(() => { elapsed = (Date.now() - started) / 1000; setClock(); }, 250); }

  async function record() {
    error = '';
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { error = '无法使用麦克风。请在浏览器中允许麦克风权限，或使用“计时练习”。'; refresh(); return; }
    const type = MIME.find((t) => MediaRecorder.isTypeSupported(t)) || '';
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
    const t = take, id = newClipId();
    mode = 'saving'; refresh();
    await upload(id, t.blob);
    commit((S) => addSpeaking(S, d, item, id, t.sec));
    URL.revokeObjectURL(t.url); take = null; mode = 'idle'; refresh();
  }

  const recorder = () => {
    if (mode === 'review') return html`<div class="recorder review">
      <audio controls src="${take.url}"></audio>
      <p class="muted">时长 ${fmtDuration(take.sec)}。回听一遍，满意就保存到账号。</p>
      <div class="row gap"><button class="btn ghost" data-act="discard">重录</button><button class="btn" data-act="keep">保存录音</button></div>
    </div>`;
    if (mode === 'saving') return html`<div class="recorder"><p class="saving-line"><i class="dot saving"></i>正在上传到云端，完成前请不要关闭页面…</p></div>`;
    const live = mode === 'recording' || mode === 'timing';
    return html`<div class="recorder ${live ? 'live' : ''}">
      <div class="arc" data-arc style="--f:${Math.min(1, elapsed / item.targetSeconds)}">
        ${live ? html`<button class="rec-btn stop" data-act="finish" aria-label="结束">${icon('stop')}</button>`
          : html`<button class="rec-btn" data-act="record" aria-label="开始录音" ${canRecord ? '' : 'disabled'}>${icon('record')}</button>`}
      </div>
      ${clock()}
      <p class="muted small">${mode === 'recording' ? '录音中 · 目标时长到达后变绿' : mode === 'timing' ? '计时中 · 不录音' : canRecord ? '点击开始录音，说完点击结束。' : '当前浏览器不支持录音，可使用计时练习。'}</p>
      ${live ? '' : html`<button class="btn ghost small" data-act="timer">计时练习（不录音）</button>`}
      ${error ? html`<p class="notice bad">${error}</p>` : ''}
    </div>`;
  };

  const roundItem = (r) => html`<li class="round">
    <span class="round-when">${fmtDateTime(r.at)}</span><span class="muted">${fmtDuration(r.sec)}</span>
    ${r.clip ? clip(players, r.clip) : html`<span class="tag soft">计时练习</span>`}
  </li>`;

  const render = () => {
    const st = itemState(store.S, 'speaking', d, item);
    return html`<article class="page speak">
      ${crumbs(d, MODULE_NAMES.speaking, `${pad2(n)} / ${pad2(items.length)}`)}
      ${pager(d, 'speaking', items, n, due, (it) => ({ done: itemState(store.S, 'speaking', d, it).done }))}
      <div class="task">
        <section class="brief">
          <p class="eyebrow">${MODULE_FR.speaking} · ${item.part}${n > due ? ' · 选做' : ''}</p>
          <h1 class="passage-title" lang="fr">${frText(item.title)}</h1>
          <p class="consigne" lang="fr">${frText(item.prompt)}</p>
          ${item.checklist && item.checklist.length ? html`<div class="checklist"><p class="label">评分要点</p><ul>${item.checklist.map((c) => html`<li lang="fr">${frText(c)}</li>`)}</ul></div>` : ''}
        </section>
        <section class="editor">${recorder()}</section>
      </div>
      ${st.records.length ? html`<section class="versions">
        <h2 class="section-title"><span>Prises</span>已完成 <small>${st.records.length} 轮</small></h2>
        <ul class="rounds">${st.records.slice().reverse().map(roundItem)}</ul>
        <div class="qnav end">${nextLink(d, 'speaking', n, items.length)}</div>
      </section>` : ''}
    </article>`;
  };

  return {
    title: `口语 · Jour ${d}`,
    render,
    unmount: () => {
      clearInterval(tick);
      if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
      stopTracks();
      if (take) URL.revokeObjectURL(take.url);
      players.forEach((u) => u && URL.revokeObjectURL(u));
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

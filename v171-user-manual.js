'use strict';
(function(){
const V171='1.7.1';
S.drafts171=S.drafts171||{writing:{},application:{}};
S.dayHistory171=S.dayHistory171||{};
if(typeof S.manualAcknowledged171!=='boolean')S.manualAcknowledged171=false;

function evidenceSignature171(){
  const taskCount=Object.values(S.taskDone||{}).filter(Boolean).length;
  const prodCount=Object.values(S.prodDone||{}).filter(Boolean).length;
  return [
    S.grammar&&S.grammar.attempts||0,
    S.reading&&S.reading.attempts||0,
    S.listening&&S.listening.attempts||0,
    S.application&&S.application.count||0,
    S.writing&&S.writing.count||0,
    S.speaking&&S.speaking.count||0,
    S.speaking&&S.speaking.totalSec||0,
    taskCount,prodCount
  ].join('|');
}
let lastEvidence171=evidenceSignature171();
function markDayActivity171(kind){
  const now=new Date().toISOString();
  if(!S.startedAt)S.startedAt=now;
  const k=String(S.selectedDay);
  const r=S.dayHistory171[k]||(S.dayHistory171[k]={firstActivityAt:now,lastActivityAt:now,actions:0,lastAction:''});
  r.lastActivityAt=now;r.actions=(r.actions||0)+1;r.lastAction=kind||'学习操作';
}
function updateSaveBadge171(){
  const el=document.getElementById('autosaveText171');if(!el)return;
  if(!S.startedAt){el.textContent='尚未开始 · 第一次答题、输入或录音后自动保存';return;}
  const t=S.lastSavedAt?new Date(S.lastSavedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'刚刚';
  el.textContent=`已自动保存 · Day ${S.selectedDay} · ${t} · 本机浏览器`;
}
const saveBase171=save;
save=function(){
  const sig=evidenceSignature171();
  if(sig!==lastEvidence171){markDayActivity171('学习记录更新');lastEvidence171=sig;}
  saveBase171();
  updateSaveBadge171();
};

function currentWriting171(){try{return typeof currentWriting==='function'?currentWriting():WRITINGS[S.writing.index%WRITINGS.length]}catch(e){return WRITINGS[S.writing.index%WRITINGS.length]}}
function currentApplication171(){try{return typeof currentApplication==='function'?currentApplication():APPLICATION[S.application.index%APPLICATION.length]}catch(e){return APPLICATION[S.application.index%APPLICATION.length]}}
function draftKey171(type,item){return `${S.selectedDay}:${type}:${item&&item.id?item.id:item&&item.title?item.title:'current'}`}
function queueDraft171(type,key,value){
  clearTimeout(queueDraft171.timers&&queueDraft171.timers[type]);
  queueDraft171.timers=queueDraft171.timers||{};
  queueDraft171.timers[type]=setTimeout(()=>{
    S.drafts171[type][key]=value;
    markDayActivity171(type==='writing'?'写作草稿':'应用草稿');
    saveBase171();
    updateSaveBadge171();
  },650);
}

const submitWritingBase171=submitWriting;
submitWriting=function(){
  const item=currentWriting171(),key=draftKey171('writing',item),before=S.writing.count;
  submitWritingBase171();
  if(S.writing.count>before){delete S.drafts171.writing[key];markDayActivity171('写作提交');saveBase171();}
};
const submitAppBase171=submitApp;
submitApp=function(){
  const item=currentApplication171(),key=draftKey171('application',item),before=S.application.count;
  submitAppBase171();
  if(S.application.count>before){delete S.drafts171.application[key];markDayActivity171('应用提交');saveBase171();}
};

function manual171(){
  const open=S.manualAcknowledged171?'':' open';
  return `<div class="card manual171"><details${open}><summary><span><b>用户手册 · 建议首次学习前阅读</b><small>了解每一步为什么做、怎么做，以及数据如何保存</small></span><span class="manualchev171">⌄</span></summary><div class="manualbody171">
    <div class="manualintro171"><b>学习原则</b><p>本课程不是“做完题=学会”。每天按照 <strong>理解 → 控制练习 → 真实应用 → 听读输入 → 写说输出 → 错题回炉</strong> 推进；5 / 6.5 / 8 小时只改变同阶段训练量，不会提前塞入后续语法。</p></div>
    <div class="manualgrid171">
      <div class="manualstep171"><span>01</span><div><b>选择 Day 与学习时长</b><p><strong>目的：</strong>让学习节奏由你掌控，同时保持推荐顺序。<br><strong>方式：</strong>默认按 Day 1→50；状态好时可提前学下一天。5 / 6.5 / 8 小时会同步改变语法、听力、阅读、写作、口语和应用配额。</p></div></div>
      <div class="manualstep171"><span>02</span><div><b>先看今天的 Can-do 与前置复习</b><p><strong>目的：</strong>先知道“今天学完要能做什么”，避免只刷题。<br><strong>方式：</strong>先完成旧知识唤醒，再进入当天新语法；Day 1–18 新知识有限，其余时间用于自动化和应用。</p></div></div>
      <div class="manualstep171"><span>03</span><div><b>Grammar Gym：建立语法手感</b><p><strong>目的：</strong>把“看得懂”变成“能自己说/写”。<br><strong>方式：</strong>规则与例句 → 客观题 → 变形/纠错 → 主动造句 → 情境调用。客观正确率只反映有答案的题，不代表整体法语水平。</p></div></div>
      <div class="manualstep171"><span>04</span><div><b>应用 + 听读：把语法迁移到真实法语</b><p><strong>目的：</strong>避免语法停留在填空。<br><strong>方式：</strong>应用任务先可看句块，再脱稿重做；听力先抓主旨再细节；阅读先定位信息，再做法语摘要和词块提取。</p></div></div>
      <div class="manualstep171"><span>05</span><div><b>写作 + 口语：形成输出能力</b><p><strong>目的：</strong>训练 DELF 真正需要的连续表达。<br><strong>方式：</strong>写作先列点再写并检查；口语录音后回听。Day 31+ 才系统进入 ≥160词写作与 DELF 三类口语任务。没有可靠评分器前，不显示虚假写作/口语百分比。</p></div></div>
      <div class="manualstep171"><span>06</span><div><b>错题回炉与第二天</b><p><strong>目的：</strong>防止“当天会、两天后忘”。<br><strong>方式：</strong>错题进入 Error Book；复习时写出规则、正确句和一个新例句。可以提前进入下一天，但之前的完成度不会被自动补齐。</p></div></div>
    </div>
    <div class="row wrap"><button class="btn" data-manual-ok171>${S.manualAcknowledged171?'已了解':'我已了解，开始学习'}</button></div>
  </div></details></div>`;
}

function injectManualStyles171(){if(document.getElementById('v171-style'))return;const st=document.createElement('style');st.id='v171-style';st.textContent=`.savecard171{border-color:#cde4dc;background:linear-gradient(180deg,#fff,#f8fcfa)}.savefacts171{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.savefacts171 span{font-size:10px;color:#57716a;background:#eef7f3;border-radius:999px;padding:5px 8px}.manual171 details>summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer}.manual171 details>summary::-webkit-details-marker{display:none}.manual171 summary small{display:block;color:var(--muted);font-weight:500;margin-top:4px}.manualchev171{font-size:18px;color:var(--muted)}.manual171 details[open] .manualchev171{transform:rotate(180deg)}.manualbody171{margin-top:14px;border-top:1px solid var(--line);padding-top:14px}.manualintro171{background:#f3f8f6;border-radius:13px;padding:12px}.manualintro171 p,.manualstorage171 p{margin:6px 0 0;font-size:12px;line-height:1.75;color:#526962}.manualgrid171{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:11px 0}.manualstep171{display:grid;grid-template-columns:34px 1fr;gap:9px;padding:11px;border:1px solid var(--line);border-radius:13px;background:#fff}.manualstep171>span{width:30px;height:30px;border-radius:10px;background:var(--soft);color:var(--brand);display:grid;place-items:center;font-weight:900;font-size:11px}.manualstep171 b{font-size:13px}.manualstep171 p{font-size:11px;line-height:1.65;color:var(--muted);margin:5px 0 0}.manualstorage171{border-left:4px solid var(--brand);padding:10px 12px;background:#f9fcfb;border-radius:0 12px 12px 0;margin:12px 0}@media(max-width:700px){.manualgrid171{grid-template-columns:1fr}.savefacts171{display:grid;grid-template-columns:1fr}}`;document.head.appendChild(st)}
injectManualStyles171();

const todayBase171=today;
today=function(){
  let h=todayBase171();
  const insert=manual171();
  const pos=h.indexOf('</section>');
  return pos>=0?h.slice(0,pos+10)+insert+h.slice(pos+10):insert+h;
};

const bindBase171=bind;
bind=function(){
  bindBase171();
  const ok=document.querySelector('[data-manual-ok171]');if(ok)ok.onclick=()=>{S.manualAcknowledged171=true;save();render()};
  const gp=document.querySelector('[data-goto-progress171]');if(gp)gp.onclick=()=>{view='progress';render()};
  const wt=document.getElementById('writeText');if(wt){const item=currentWriting171(),key=draftKey171('writing',item);if(S.drafts171.writing[key]&&!wt.value)wt.value=S.drafts171.writing[key];wt.addEventListener('input',()=>queueDraft171('writing',key,wt.value));}
  const at=document.getElementById('appText');if(at){const item=currentApplication171(),key=draftKey171('application',item);if(S.drafts171.application[key]&&!at.value)at.value=S.drafts171.application[key];at.addEventListener('input',()=>queueDraft171('application',key,at.value));}
  updateSaveBadge171();
};

S.version=V171;saveBase171();render();
})();

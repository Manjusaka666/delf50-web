'use strict';
(function(){
const APP='1.8.2',CONTENT='1.8.1',UI_ROUTE='student-ui-clean-v1';
function escUI(v){return typeof esc==='function'?esc(v):String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function currentQuotaUI(){try{return typeof quota==='function'?quota():(typeof QUOTAS!=='undefined'?(QUOTAS[S.intensity]||QUOTAS.standard):{})}catch(e){return{}}}
function currentLabelUI(){try{return LEVELS&&LEVELS[S.intensity]?LEVELS[S.intensity].label:S.intensity}catch(e){return S.intensity||''}}
function currentDailyUI(){try{return typeof daily==='function'?daily():((S.daily&&S.daily[String(S.selectedDay)])||{})}catch(e){return{}}}
function persistUI(){try{if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

const todayBaseUI=today;
today=function(){
  let h=todayBaseUI(),q=currentQuotaUI(),label=currentLabelUI(),d=currentDailyUI();
  const overview=`<div class="card dailyoverviewUI"><div class="row wrap"><div><b>今日训练</b><div class="muted">Day ${Number(S.selectedDay)||1} · ${escUI(label)}</div></div><span class="pill blue">按计划完成</span></div><div class="dailygridUI"><div><span>语法</span><b>${Number(d.grammar||0)}/${Number(q.grammar||0)} 题</b></div><div><span>听力</span><b>${Number(d.listening||0)}/${Number(q.listening||0)} 组</b></div><div><span>阅读</span><b>${Number(d.reading||0)}/${Number(q.reading||0)} 篇</b></div><div><span>写作</span><b>${Number(d.writing||0)}/${Number(q.writing||0)} 项</b></div><div><span>口语</span><b>${Number(d.speaking||0)}/${Number(q.speaking||0)} 轮</b></div><div><span>应用</span><b>${Number(d.application||0)}/${Number(q.application||0)} 项</b></div></div></div>`;
  const re=/<div class="card demandtoday182">[\s\S]*?(?=<div class="card"><b>今天的新旧比例)/;
  if(re.test(h))h=h.replace(re,overview);
  else if(!h.includes('dailyoverviewUI'))h=overview+h;
  return h;
};

const grammarBaseUI=grammar;
grammar=function(){
  let h=grammarBaseUI(),q=currentQuotaUI(),d=currentDailyUI(),target=Number(q.grammar||0),done=Number(d.grammar||0),label=currentLabelUI();
  h=h.replace(/Day \d+ · 今日按 [^<]* 分配 \d+ 题/g,`Day ${Number(S.selectedDay)||1} · ${escUI(label)} · 今日 ${target} 题`);
  h=h.replace(/<b>今日语法供需分配<\/b>/g,'<b>今日语法训练</b>');
  h=h.replace(/<div class="muted">题库容量只作为库存；今日只解锁当前学习时长需要的题量。[\s\S]*?<\/div>/g,'<div class="muted">按今天的学习计划完成即可。</div>');
  h=h.replace(/<b>当前分配节点<\/b>/g,'<b>当前语法</b>');
  h=h.replace(/<div class="gmeters176">[\s\S]*?<\/div>(?=<\/div><div class="pager174)/,`<div class="gmeters176"><span>今日进度 <b>${Math.min(done,target)}/${target}</b></span></div>`);
  h=h.replace(/ · 不显示题库总容量/g,'');
  h=h.replace(/<div class="gsource176">[\s\S]*?<\/div>/g,'');
  h=h.replace(/主动产出仍按当前学习强度增长，和客观题库存分开计算。/g,'完成后再尝试脱稿说出或写出新的例句。');
  h=h.replace(/只标出今日分配量；其余节点保留为知识索引，不把整库题数暴露为今日任务。/g,'用于快速回看已学语法与今天的重点。');
  h=h.replace(/<span class="pill blue">今日 \d+题<\/span>/g,'<span class="pill blue">今日重点</span>');
  h=h.replace(/<span class="pill">今日未分配<\/span>/g,'');
  return h;
};

if(typeof progressPage==='function'){
  const progressBaseUI=progressPage;
  progressPage=function(){
    let h=progressBaseUI();
    h=h.replace(/(<span>教学内容版本<\/span><b>)[^<]*(<\/b>)/g,`$1${CONTENT}$2`);
    h=h.replace(/(<span>教学版本<\/span><b>)[^<]*(<\/b>)/g,`$1${CONTENT}$2`);
    return h;
  };
}

const saveBaseUI=save;
save=function(){
  const out=saveBaseUI();
  
  persistUI();
  return out;
};

function injectUI(){
  if(document.getElementById('v182-student-ui-style'))return;
  const st=document.createElement('style');st.id='v182-student-ui-style';
  st.textContent=`.dailyoverviewUI{padding:14px 16px;border-color:#d8e7e2}.dailygridUI{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:12px}.dailygridUI>div{background:#f6faf8;border:1px solid #e6efec;border-radius:12px;padding:10px 9px}.dailygridUI span{display:block;font-size:10px;color:var(--muted);margin-bottom:3px}.dailygridUI b{font-size:12px}.demand182>.barrow{margin-bottom:0}@media(max-width:700px){.dailygridUI{grid-template-columns:repeat(3,minmax(0,1fr))}}`;
  document.head.appendChild(st);
}
injectUI();

persistUI();
globalThis.__DELF50_STUDENT_UI={appVersion:APP,contentVersion:CONTENT,route:UI_ROUTE};
render();
})();

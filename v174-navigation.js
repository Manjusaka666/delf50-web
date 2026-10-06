'use strict';
(function(){
const APP_VERSION_174='1.7.4';
const CONTENT_VERSION_174='1.7.1';
UI.browse174=UI.browse174||{reading:{},listening:{}};

function h174(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function dayCursorBox174(type){const box=UI.browse174[type]||(UI.browse174[type]={}),k=String(S.selectedDay);if(!Number.isInteger(box[k])){const done=Number((daily()||{})[type]||0),target=Number((quota()||{})[type]||1);box[k]=done<target?done:Math.max(0,done-1)}return box}
function browseIndex174(type){return dayCursorBox174(type)[String(S.selectedDay)]||0}
function setBrowseIndex174(type,n){const box=dayCursorBox174(type),hi=highestBrowse174(type);box[String(S.selectedDay)]=Math.max(0,Math.min(hi,Number(n)||0))}
function highestBrowse174(type){const d=Number((daily()||{})[type]||0),target=Number((quota()||{})[type]||1);return Math.max(0,d<target?d:d-1)}
function browseTarget174(type){return Math.max(Number((quota()||{})[type]||1),Number((daily()||{})[type]||0))}
function assigned174(type,index){if(window.DELF50_ARCH&&typeof window.DELF50_ARCH.resolveAssignedContent==='function')return window.DELF50_ARCH.resolveAssignedContent(type,index,S.selectedDay);if(type==='reading')return pick(typeof V13_READINGS!=='undefined'?V13_READINGS:READINGS,index,S.selectedDay);return pick(typeof V13_LISTENINGS!=='undefined'?V13_LISTENINGS:LISTENINGS,index,S.selectedDay)}
currentReading=function(){return assigned174('reading',browseIndex174('reading'))};
currentListening=function(){return assigned174('listening',browseIndex174('listening'))};
function inputPager174(type){const idx=browseIndex174(type),hi=highestBrowse174(type),done=Number((daily()||{})[type]||0),target=browseTarget174(type),label=type==='reading'?'阅读':'听力';return `<div class="pager174"><button class="btn secondary small" data-input-page174="${type}" data-step174="-1" ${idx<=0?'disabled':''}>← 上一${type==='reading'?'篇':'组'}</button><div><b>${label} ${idx+1}/${target}</b><span>${idx<done?'已完成 · 回看':idx===done?'当前学习':'未解锁'}</span></div><button class="btn secondary small" data-input-page174="${type}" data-step174="1" ${idx>=hi?'disabled':''}>下一${type==='reading'?'篇':'组'} →</button></div>`}

function ensureCompleted174(type,id,day,extra){S.contentProgress172=S.contentProgress172||{};S.contentProgress172.completed=S.contentProgress172.completed||{};S.contentProgress172.completed[type]=S.contentProgress172.completed[type]||{};const old=S.contentProgress172.completed[type][id]||{};S.contentProgress172.completed[type][id]=Object.assign({firstCompletedAt:new Date().toISOString()},old,extra||{},{day:Number(day),lastCompletedAt:new Date().toISOString()})}
function itemId174(item,type,index){return item&&item.id?String(item.id):item&&item.provenance&&item.provenance.traceId?String(item.provenance.traceId):`${type}-legacy-${index}`}
completeReading=function(){const idx=browseIndex174('reading'),done=Number(daily().reading||0),r=currentReading(),base=`${S.selectedDay}:${r.id}`;if(idx<done){setBrowseIndex174('reading',idx+1);render();return}if(idx!==done||!r.qs.every((_,qi)=>S.reading.answers[`${base}:${qi}`]!==undefined))return;ensureCompleted174('reading',itemId174(r,'reading',idx),S.selectedDay);daily().reading++;S.reading.index=(S.reading.index||0)+1;const next=Number(daily().reading)<browseTarget174('reading')?Number(daily().reading):Math.max(0,Number(daily().reading)-1);setBrowseIndex174('reading',next);save();render()};
completeListening=function(){const idx=browseIndex174('listening'),done=Number(daily().listening||0),l=currentListening(),base=`${S.selectedDay}:${l.id}`;if(idx<done){setBrowseIndex174('listening',idx+1);render();return}if(idx!==done||!l.qs.every((_,qi)=>S.listening.answers[`${base}:${qi}`]!==undefined))return;ensureCompleted174('listening',itemId174(l,'listening',idx),S.selectedDay);daily().listening++;S.listening.index=(S.listening.index||0)+1;const next=Number(daily().listening)<browseTarget174('listening')?Number(daily().listening):Math.max(0,Number(daily().listening)-1);setBrowseIndex174('listening',next);save();render()};

const readingViewBase174=readingView;
readingView=function(r){const idx=browseIndex174('reading'),done=Number(daily().reading||0);let html=readingViewBase174(r);if(idx<done)html=html.replace('完成本篇并进入下一篇','本篇已完成 · 下一篇 →');return inputPager174('reading')+html};
const listeningViewBase174=listeningView;
listeningView=function(l){const idx=browseIndex174('listening'),done=Number(daily().listening||0);let html=listeningViewBase174(l);if(idx<done)html=html.replace('完成本组并进入下一组','本组已完成 · 下一组 →');return inputPager174('listening')+html};

const GRAMMAR_DEEP_174=window.DELF50_GRAMMAR_GUIDES_174||{};
function deepGuide174(g){const x=GRAMMAR_DEEP_174[g.id];if(!x)return'';function list(a){return `<ul>${a.map(v=>`<li>${h174(v)}</li>`).join('')}</ul>`}return `<div class="card deepgrammar174"><div class="deephead174"><div><span class="pill blue">基础详解</span><h2>${h174(x.title)}</h2><p>${h174(x.why)}</p></div></div><details open><summary>① 核心结构 / 变位</summary><div class="deepbody174">${list(x.formula)}</div></details><details><summary>② 最小对比：什么时候用它</summary><div class="deepbody174">${list(x.contrast)}</div></details><details><summary>③ 高频错误：为什么错</summary><div class="deepbody174">${list(x.errors)}</div></details><details><summary>④ DELF 里怎么调用</summary><div class="deepbody174">${list(x.delf)}</div></details><details><summary>⑤ 从“会看”到“会说/写”</summary><div class="deepbody174">${list(x.production)}<div class="callout good">建议：先不看答案口头完成，再写下来检查。能解释规则只是第一层，能在新情境里主动调用才算真正掌握。</div></div></details></div>`}
function grammarHistory174(g,qIndex){try{const q=grammarQuestions(g)[qIndex],id=q&&q[4]&&q[4].traceId,rec=id&&S.contentProgress172&&S.contentProgress172.completed&&S.contentProgress172.completed.grammar&&S.contentProgress172.completed.grammar[id];return rec?`<span class="pill ${rec.correct?'':'warn'}">历史：${rec.correct?'正确':'需复盘'}</span>`:''}catch(e){return''}}
function grammarPager174(){const g=GRAMMAR[UI.gNode],qs=grammarQuestions(g),idx=Math.max(0,Math.min(qs.length-1,Number(UI.gQ)||0));return `<div class="pager174 grammarpager174"><button class="btn secondary small" data-gq-step174="-1" ${idx<=0?'disabled':''}>← 上一题</button><div><b>${h174(g.name)} · 第 ${idx+1}/${qs.length} 题</b><span>翻题不计入学习量 ${grammarHistory174(g,idx)}</span></div><button class="btn secondary small" data-gq-step174="1" ${idx>=qs.length-1?'disabled':''}>下一题 →</button></div>`}
const grammarBase174=grammar;
grammar=function(){let html=grammarBase174();html=html.replace(/<button class="btn" id="nextGQ">下一题<\/button>/g,'<button class="btn secondary" data-gq-step174="1">下一题 →</button>');const marker='<div class="grid2">',pos=html.indexOf(marker);if(pos>=0)html=html.slice(0,pos)+grammarPager174()+html.slice(pos);else html=grammarPager174()+html;return html+deepGuide174(GRAMMAR[UI.gNode])};

function injectStyles174(){if(document.getElementById('v174-style'))return;const st=document.createElement('style');st.id='v174-style';st.textContent=`.pager174{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:15px;padding:10px;margin:10px 0}.pager174>div{text-align:center;min-width:0}.pager174>div b{display:block;font-size:12px}.pager174>div span{display:block;font-size:9px;color:var(--muted);margin-top:3px}.grammarpager174{border-color:#cfe3dc;background:#fbfdfc}.deepgrammar174{padding:15px}.deephead174 h2{margin:7px 0}.deephead174 p{font-size:12px;line-height:1.75;color:#526962;margin:0 0 8px}.deepgrammar174 details{border-top:1px solid var(--line);padding:0}.deepgrammar174 summary{cursor:pointer;list-style:none;padding:12px 2px;font-weight:800;font-size:12px}.deepgrammar174 summary::-webkit-details-marker{display:none}.deepgrammar174 summary:after{content:'＋';float:right;color:var(--muted)}.deepgrammar174 details[open] summary:after{content:'−'}.deepbody174{padding:0 4px 12px}.deepbody174 ul{margin:0;padding-left:19px}.deepbody174 li{font-size:12px;line-height:1.7;margin:5px 0;color:#405b54}.deepbody174 .callout{margin-top:10px}@media(max-width:640px){.pager174{grid-template-columns:auto 1fr auto;padding:8px}.pager174 .btn.small{padding:8px 9px}.pager174>div b{font-size:11px}.deepgrammar174{padding:13px}}`;document.head.appendChild(st)}
injectStyles174();

const bindBase174=bind;
bind=function(){bindBase174();document.querySelectorAll('[data-input-page174]').forEach(b=>b.onclick=()=>{const type=b.dataset.inputPage174;setBrowseIndex174(type,browseIndex174(type)+Number(b.dataset.step174||0));render()});document.querySelectorAll('[data-gq-step174]').forEach(b=>b.onclick=()=>{const g=GRAMMAR[UI.gNode],n=grammarQuestions(g).length,next=Math.max(0,Math.min(n-1,(Number(UI.gQ)||0)+Number(b.dataset.gqStep174||0)));UI.gQ=next;UI.gSel=null;UI.gAnswered=false;render()})};

const setDayBase174=setDay;
setDay=function(n){setDayBase174(n);const day=String(S.selectedDay);for(const type of['reading','listening']){const box=UI.browse174[type]||(UI.browse174[type]={});delete box[day]}};

const saveBase174=save;
save=function(){saveBase174();try{if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const progressBase174=progressPage;
progressPage=function(){return progressBase174().replace(/(<span>教学内容版本<\/span><b>)1\.7\.0(<\/b>)/,'$1'+CONTENT_VERSION_174+'$2')};
if(window.DELF50_ARCH){window.DELF50_ARCH.version=APP_VERSION_174;window.DELF50_ARCH.contentVersion=CONTENT_VERSION_174;if(typeof window.DELF50_ARCH.report==='function'){const r0=window.DELF50_ARCH.report;window.DELF50_ARCH.report=()=>Object.assign(r0(),{appVersion:APP_VERSION_174,contentVersion:CONTENT_VERSION_174})}}

window.DELF50_NAVIGATION={version:APP_VERSION_174,contentVersion:CONTENT_VERSION_174,getCursor:(type)=>browseIndex174(type),getHighest:(type)=>highestBrowse174(type),deepGrammarNodes:Object.keys(GRAMMAR_DEEP_174).length};
save();render();
})();

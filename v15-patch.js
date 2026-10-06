'use strict';
const V15_VERSION='1.5.3';
Object.assign(QUOTAS.light,{grammar:8,application:2,listening:2,reading:2,writing:1,speaking:2,vocab:25,review:10});
Object.assign(QUOTAS.standard,{grammar:10,application:3,listening:3,reading:3,writing:1,speaking:3,vocab:35,review:15});
Object.assign(QUOTAS.high,{grammar:12,application:4,listening:4,reading:4,writing:2,speaking:4,vocab:45,review:20});
const V15_PROD={light:6,standard:8,high:10};
S.prodDone=S.prodDone||{};
const _dailyV15=daily;
daily=function(day=S.selectedDay){const d=_dailyV15(day);if(typeof d.grammarProd!=='number')d.grammarProd=0;return d};
function prodQuota(){return V15_PROD[S.intensity]||8}
function prodKey(gid,i){return `${S.selectedDay}:${gid}:${i}`}
function prodPrompts(g){const map={
 present:['用 être / avoir 各写一句自我介绍。','用 aller / faire 各写一句日常习惯。','把一个 je 句改写成 nous 和 ils/elles。','口头说4句今天的活动。'],
 negation:['把2个肯定句改成 ne…pas。','分别用 ne…jamais / ne…plus 造句。','口头说3件今天不做的事。'],
 questions:['分别用 où / quand / pourquoi / combien 提问。','把2个陈述句改成 est-ce que 问句。','模拟车站连续提3个问题。'],
 pc:['写3句昨天完成的动作。','分别用 avoir 和 être 造过去时句子。','口头讲30秒昨天晚上。'],
 imparfait:['写2句童年习惯。','写2句过去的天气/场景背景。','口头描述童年生活30秒。'],
 pcimp:['写2组“背景 + 突发事件”。','讲一个30秒小事故，两种过去时都要用。'],
 conditionnel:['用 je voudrais / pourriez-vous 各写2个请求。','用 à ta place + conditionnel 给2条建议。'],
 connectors:['用 parce que / donc 写2组因果。','用 cependant / pourtant 写2个转折。','口头说45秒观点，至少3个连接词。'],
 opinion:['写5句迷你论证：观点→理由→例子→转折→结论。','口头说1分钟观点并给出结论。']
 };return map[g.id]||[`用 ${g.name} 写2个与今天主题有关的句子。`,`把一道练习题改写成自己的句子。`,`口头说30–60秒并强制使用 ${g.name}。`];}
const _taskCountV15=taskCount;
taskCount=function(id,day=S.selectedDay){if(id==='grammar'){const d=daily(day),q=quota();return [Math.min(d.grammar,q.grammar)+Math.min(d.grammarProd,prodQuota()),q.grammar+prodQuota()]}return _taskCountV15(id,day)};
const _totalV15=totalCompletedTasks;
totalCompletedTasks=function(){let n=_totalV15();for(const d of Object.values(S.daily||{}))n+=(d.grammarProd||0);return n};
const _buildV15=buildTasks;
buildTasks=function(day){const t=_buildV15(day),q=quota();t[0].desc=`${DAYS[day-1][1]}：${q.grammar} 道客观题 + ${prodQuota()} 个主动产出单位；识别、变形、纠错、造句和口头调用都要做。`;return t};
const _grammarV15=grammar;
grammar=function(){const g=GRAMMAR[UI.gNode],d=daily(),need=prodQuota(),prompts=prodPrompts(g);return _grammarV15()+`<div class="card"><div class="row wrap"><div><b>主动产出 · ${g.name}</b><div class="muted">目标 ${need} 个句子/口头单位；只算训练证据，不改变客观正确率。</div></div><span class="pill ${d.grammarProd>=need?'':'blue'}">${Math.min(d.grammarProd,need)}/${need}</span></div>${prompts.slice(0,5).map((p,i)=>`<div class="node"><div class="row wrap"><div style="flex:1"><b>${i+1}.</b> ${p}</div><button class="btn secondary small" data-prod-record="${i}" data-prod-g="${g.id}" ${S.prodDone[prodKey(g.id,i)]?'disabled':''}>${S.prodDone[prodKey(g.id,i)]?'✓ 已记录':'记录2句'}</button></div></div>`).join('')}</div>`};
const _bindV15=bind;
bind=function(){_bindV15();document.querySelectorAll('[data-prod-record]').forEach(b=>b.onclick=()=>{const k=prodKey(b.dataset.prodG,Number(b.dataset.prodRecord));if(S.prodDone[k])return;S.prodDone[k]=true;daily().grammarProd+=2;if(!S.startedAt)S.startedAt=new Date().toISOString();save();render()})};
top=function(title,sub){return `<div class="top"><div><div class="eyebrow">DELF50 · WEB V${V15_VERSION}</div><h1>${title}</h1><div class="muted">${sub}</div></div><span class="pill">交互已启动</span></div>`};
save();render();

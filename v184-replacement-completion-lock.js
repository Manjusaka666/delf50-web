'use strict';
(function(){
const APP='1.8.4';
const PATCH='replacement-completion-lock-v1';
const TYPES=['reading','listening'];

function bank184(t){
  if(t==='reading')return typeof V13_READINGS!=='undefined'?V13_READINGS:READINGS;
  return typeof V13_LISTENINGS!=='undefined'?V13_LISTENINGS:LISTENINGS;
}
function find184(t,id){return bank184(t).find(x=>String(x.id)===String(id))||null}
function box184(day){
  S.assignments172=S.assignments172||{};
  const k=String(day);
  if(!S.assignments172[k])S.assignments172[k]={reading:[],listening:[],writing:[],speaking:[],application:[]};
  for(const t of TYPES)S.assignments172[k][t]=Array.isArray(S.assignments172[k][t])?S.assignments172[k][t]:[];
  return S.assignments172[k];
}
function replacement184(t,day,slot){
  return S.replacements177&&S.replacements177[t]&&S.replacements177[t][`${day}:${slot}`]||null;
}
function done184(day,t){return Number(S.daily&&S.daily[String(day)]&&S.daily[String(day)][t]||0)}
function browse184(t,day=S.selectedDay){
  const z=typeof UI!=='undefined'&&UI.browse174&&UI.browse174[t],k=String(day);
  return z&&Number.isInteger(z[k])?z[k]:done184(day,t);
}
function slot184(n){return Math.max(0,Math.min(3,Number(n)||0))}
function persist184(){
  try{if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
}
function promote184(t,r){
  if(!r||r.status!=='completed'||!r.newId||!find184(t,r.newId))return false;
  const day=Number(r.day),slot=Number(r.slot);
  if(!Number.isInteger(day)||!Number.isInteger(slot)||slot<0||slot>3)return false;
  const a=box184(day),previous=a[t][slot]||null;
  if(previous&&String(previous)!==String(r.newId)&&!r.previousAssignmentId)r.previousAssignmentId=String(previous);
  if(!r.previousAssignmentId&&r.oldId)r.previousAssignmentId=String(r.oldId);
  a[t][slot]=String(r.newId);
  r.promotedAt=r.promotedAt||new Date().toISOString();
  r.routeStatus='promoted-completed-replacement';
  S.contentProgress172=S.contentProgress172||{};
  S.contentProgress172.completed=S.contentProgress172.completed||{};
  S.contentProgress172.completed[t]=S.contentProgress172.completed[t]||{};
  const cp=S.contentProgress172.completed[t][r.newId]||{};
  cp.day=day;
  cp.replacementFor=r.oldId||r.previousAssignmentId||null;
  cp.repairVersion=cp.repairVersion||'day3-correction-v1';
  cp.routePatch=PATCH;
  cp.firstCompletedAt=cp.firstCompletedAt||r.completedAt||r.promotedAt;
  cp.lastCompletedAt=cp.lastCompletedAt||r.completedAt||r.promotedAt;
  S.contentProgress172.completed[t][r.newId]=cp;
  return true;
}
function migrate184(){
  let changed=false;
  for(const t of TYPES){
    const map=S.replacements177&&S.replacements177[t]||{};
    for(const r of Object.values(map))if(promote184(t,r))changed=true;
  }
  if(changed)persist184();
  return changed;
}
function resolve184(t,day,slot){
  const r=replacement184(t,day,slot);
  if(r&&r.newId){const replacement=find184(t,r.newId);if(replacement)return replacement;}
  const a=box184(day),id=a[t][slot];
  return find184(t,id)||bank184(t)[0];
}

migrate184();
currentReading=function(){const d=Number(S.selectedDay);return resolve184('reading',d,slot184(browse184('reading',d)))};
currentListening=function(){const d=Number(S.selectedDay);return resolve184('listening',d,slot184(browse184('listening',d)))};

const completeReading184=completeReading;
completeReading=function(){
  const d=Number(S.selectedDay),s=slot184(browse184('reading',d)),r=replacement184('reading',d,s);
  completeReading184();
  if(r&&r.status==='completed'&&promote184('reading',r)){persist184();render();}
};
const completeListening184=completeListening;
completeListening=function(){
  const d=Number(S.selectedDay),s=slot184(browse184('listening',d)),r=replacement184('listening',d,s);
  completeListening184();
  if(r&&r.status==='completed'&&promote184('listening',r)){persist184();render();}
};

S.repairs184=S.repairs184||{};
S.repairs184[PATCH]={at:S.repairs184[PATCH]&&S.repairs184[PATCH].at||new Date().toISOString(),status:'active',types:TYPES.slice(),note:'Completed replacement material remains the canonical slot content; old duplicate evidence is retained without incrementing daily completion again.'};

persist184();
globalThis.__DELF50_V184={version:APP,patch:PATCH,migrate:migrate184,resolve:resolve184};
if(typeof render==='function')render();
})();

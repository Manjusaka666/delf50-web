'use strict';
(function(){
const APP='1.8.6',CONTENT='1.8.1',ROUTE='pedagogical-display-clean-v2';
const TYPES=['reading','listening','writing','speaking','application'];
const ID_RE=/^([rlwsa]181)-d\d{2}-s\d{2}$/i;
function clone(x){try{return JSON.parse(JSON.stringify(x))}catch(e){return x}}
function is181(x){return !!(x&&ID_RE.test(String(x.id||'')))}
function capStart(s){s=String(s==null?'':s).trim();return s?s.charAt(0).toUpperCase()+s.slice(1):s}
function tidy(s){
  return String(s==null?'':s)
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n[ \t]+/g,'\n')
    .replace(/[ \t]{2,}/g,' ')
    .replace(/\s+([,.;!?])/g,'$1')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function cleanCommon(s){
  let out=String(s==null?'':s);
  out=out.replace(/^\s*(?:Dossier|Audio)\s+[RLSWA]\d{2}-\d+\s*[—–-]\s*/i,'');
  out=out.replace(/^\s*Dossier\s+[RLSWA]\d{2}-\d+\.\s*/i,'');
  out=out.replace(/\bDans le dossier\s+[RLSWA]\d{2}-\d+\s*,?\s*/gi,'');
  out=out.replace(/\bCette activité est une reformulation pédagogique originale à partir d['’]une source publique\s*;?\s*elle ne remplace pas la consultation de la source officielle\.?/gi,'');
  out=out.replace(/\bLes mots[- ]clés du dossier sont\s+[^.?!]*[.?!]?/gi,'');
  out=out.replace(/\bDELF50\s*原创\b/gi,'');
  out=out.replace(/\bFEI-B1\b|\bCEFR-DESC\b/gi,'');
  return capStart(tidy(out));
}
function cleanListeningScript(s){
  let out=String(s==null?'':s);
  out=out.replace(/Vous écoutez le message\s+[RLSWA]\d{2}-\d+\s+au sujet de/gi,'Vous écoutez un message au sujet de');
  out=out.replace(/je vous appelle pour le dossier\s+[RLSWA]\d{2}-\d+\s*\.?\s*/gi,'je vous appelle au sujet de ');
  out=out.replace(/Dans notre chronique pratique\s+[RLSWA]\d{2}-\d+\s*,/gi,'Dans notre chronique pratique,');
  out=out.replace(/Annonce\s+[RLSWA]\d{2}-\d+\s*\./gi,'Annonce.');
  out=out.replace(/Réunion\s+[RLSWA]\d{2}-\d+\s*\./gi,'Réunion.');
  out=out.replace(/\b(?:message|dossier|audio)\s+[RLSWA]\d{2}-\d+\b/gi,m=>m.replace(/[RLSWA]\d{2}-\d+/i,'').trim());
  return cleanCommon(out);
}
function cleanWhy(s){
  let out=String(s==null?'':s)
    .replace(/du dossier/gi,'du texte')
    .replace(/dans le dossier/gi,'dans le texte')
    .replace(/Le script cite explicitement le lexique du texte\.?/gi,"Le mot est cité explicitement dans l’enregistrement.")
    .replace(/La consigne finale donne la fonction communicative attendue\.?/gi,"La fin de l’enregistrement indique clairement l’action attendue.");
  return cleanCommon(out);
}
function studentCopy(type,x){
  if(!is181(x))return x;
  const c=clone(x);
  c.title=cleanCommon(c.title);
  if(type==='reading'){
    c.text=cleanCommon(c.text);
    c.qs=(c.qs||[]).map(q=>{
      const z=clone(q);
      z[0]=cleanCommon(z[0]);
      z[1]=(z[1]||[]).map(cleanCommon);
      z[3]=cleanWhy(z[3]);
      return z;
    });
  }else if(type==='listening'){
    c.script=cleanListeningScript(c.script);
    c.qs=(c.qs||[]).map(q=>{
      const z=clone(q);
      z[0]=cleanCommon(z[0]);
      z[1]=(z[1]||[]).map(cleanCommon);
      z[3]=cleanWhy(z[3]);
      return z;
    });
  }else if(type==='writing'||type==='speaking'){
    c.prompt=cleanCommon(c.prompt);
    if(Array.isArray(c.check))c.check=c.check.map(cleanCommon);
  }else{
    c.task=cleanCommon(c.task);
    if(Array.isArray(c.keys))c.keys=c.keys.map(cleanCommon);
    if(Array.isArray(c.chunks))c.chunks=c.chunks.map(cleanCommon);
  }
  return c;
}
function stripAuditHtml(html){
  try{
    const t=document.createElement('template');
    t.innerHTML=String(html||'');
    t.content.querySelectorAll('.prov,.qsource,.gsource176,.tracepill').forEach(el=>el.remove());
    return t.innerHTML;
  }catch(e){return String(html||'')}
}
function wrapCurrent(name,type){
  const base=globalThis[name];
  if(typeof base!=='function')return;
  globalThis[name]=function(){return studentCopy(type,base.apply(this,arguments))};
}
wrapCurrent('currentReading','reading');
wrapCurrent('currentListening','listening');
wrapCurrent('currentWriting','writing');
wrapCurrent('currentSpeaking','speaking');
wrapCurrent('currentApplication','application');

if(typeof readingView==='function'){
  const base=readingView;
  readingView=function(x){return stripAuditHtml(base(studentCopy('reading',x)))};
}
if(typeof listeningView==='function'){
  const base=listeningView;
  listeningView=function(x){return stripAuditHtml(base(studentCopy('listening',x)))};
}
if(typeof writingView==='function'){
  const base=writingView;
  writingView=function(){return stripAuditHtml(base())};
}
if(typeof speakingView==='function'){
  const base=speakingView;
  speakingView=function(){return stripAuditHtml(base())};
}
if(typeof applicationView==='function'){
  const base=applicationView;
  applicationView=function(){return stripAuditHtml(base())};
}
if(typeof grammar==='function'){
  const base=grammar;
  grammar=function(){return stripAuditHtml(base())};
}

function bank(type){
  if(type==='reading')return typeof V13_READINGS!=='undefined'?V13_READINGS:READINGS;
  if(type==='listening')return typeof V13_LISTENINGS!=='undefined'?V13_LISTENINGS:LISTENINGS;
  if(type==='writing')return typeof V13_WRITINGS!=='undefined'?V13_WRITINGS:WRITINGS;
  if(type==='speaking')return typeof V13_SPEAKING!=='undefined'?V13_SPEAKING:SPEAKING;
  return typeof V13_APPLICATION!=='undefined'?V13_APPLICATION:APPLICATION;
}
function audit(){
  let checked=0,idMismatch=0,answerMismatch=0,forbidden=0;
  const bad=/\b[RLSWA]\d{2}-\d+\b|reformulation pédagogique|source publique|source officielle|DELF50\s*原创|FEI-B1|CEFR-DESC/i;
  for(const type of TYPES){
    for(const x of bank(type)){
      if(!is181(x))continue;
      checked++;
      const c=studentCopy(type,x);
      if(String(c.id)!==String(x.id))idMismatch++;
      if(Array.isArray(x.qs)&&Array.isArray(c.qs)){
        for(let i=0;i<x.qs.length;i++)if(Number(x.qs[i]&&x.qs[i][2])!==Number(c.qs[i]&&c.qs[i][2]))answerMismatch++;
      }
      const visible=[c.title,c.text,c.script,c.prompt,c.task];
      if(Array.isArray(c.qs))c.qs.forEach(q=>visible.push(q[0],...(q[1]||[]),q[3]));
      if(visible.filter(Boolean).some(v=>bad.test(String(v))))forbidden++;
    }
  }
  return{checked,idMismatch,answerMismatch,forbidden,nonDestructive:idMismatch===0&&answerMismatch===0};
}
const report=audit();
try{if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
globalThis.__DELF50_V186={appVersion:APP,contentVersion:CONTENT,route:ROUTE,audit:report,studentCopy};
if(typeof render==='function')render();
})();
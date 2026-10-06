'use strict';
(function(){
const APP='1.7.8',CONTENT='1.7.4',AUDIT='full-question-audit-v1';
const TYPES=['reading','listening','writing','speaking','application'];
const MAX={reading:4,listening:4,writing:2,speaking:4,application:4};
function bank(t){
  if(t==='reading')return typeof V13_READINGS!=='undefined'?V13_READINGS:READINGS;
  if(t==='listening')return typeof V13_LISTENINGS!=='undefined'?V13_LISTENINGS:LISTENINGS;
  if(t==='writing')return typeof V13_WRITINGS!=='undefined'?V13_WRITINGS:WRITINGS;
  if(t==='speaking')return typeof V13_SPEAKING!=='undefined'?V13_SPEAKING:SPEAKING;
  return typeof V13_APPLICATION!=='undefined'?V13_APPLICATION:APPLICATION;
}
function find(t,id){return bank(t).find(x=>String(x&&x.id)===String(id))||null}
function parseGenerated(id){const m=String(id||'').match(/^[rl]177-d(\d{2})-s(\d{2})$/);return m?{day:Number(m[1]),slot:Number(m[2])-1}:null}
function answers(t){return (t==='reading'?S.reading:S.listening)&&((t==='reading'?S.reading:S.listening).answers)||{}}
function assignment(t,d){return S.assignments172&&S.assignments172[String(d)]&&Array.isArray(S.assignments172[String(d)][t])?S.assignments172[String(d)][t]:[]}
function done(t,d){return Number(S.daily&&S.daily[String(d)]&&S.daily[String(d)][t]||0)}
function replacement(t,d,s){try{return window.DELF50_NOREPEAT&&window.DELF50_NOREPEAT.replacement?window.DELF50_NOREPEAT.replacement(t,d,s):null}catch(e){return null}}
function patchGeneratedQuestions(){let patched=0;
  for(const t of['reading','listening'])for(const item of bank(t)){
    const p=parseGenerated(item&&item.id);if(!p||!Array.isArray(item.qs)||item.qs.length<3)continue;
    if(t==='reading'){
      const ref=(String(item.text||'').match(/référence\s+(\d+)/i)||[])[1]||`${p.day}-${p.slot+1}`;
      const place=(String(item.text||'').match(/au\s+([^,]+),\s*(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i)||[])[1]||item.title||'lieu indiqué';
      item.qs[0][0]=`Dans le dossier ${ref}, où se déroule l’activité mentionnée ?`;
      item.qs[1][0]=`Pour le dossier ${ref} au ${place}, quel document faut-il apporter ?`;
      item.qs[2][0]=`Quelle ligne de transport dessert ${place} dans le dossier ${ref} ?`;
    }else{
      const ref=(String(item.script||'').match(/référence\s+(\d+)/i)||[])[1]||`${p.day}-${p.slot+1}`;
      const place=(String(item.script||'').match(/ici\s+([^\.]+)\./i)||[])[1]||item.title||'service indiqué';
      item.qs[0][0]=`Quel jour est annoncé pour le dossier ${ref} de ${place} ?`;
      item.qs[1][0]=`Pour le dossier ${ref}, que faut-il faire si l’horaire doit changer ?`;
      item.qs[2][0]=`Quel montant est annoncé pour le dossier ${ref} de ${place} ?`;
    }
    patched++;
  }
  return{patched};
}
const patchResult=patchGeneratedQuestions();
function norm(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim()}
function body(t,x){return norm(t==='reading'?x&&x.text:t==='listening'?x&&x.script:t==='application'?x&&x.task:x&&x.prompt)}
function isProtected(t,d,s,id){
  if(!id)return false;if(s<done(t,d))return true;
  if(t==='reading'||t==='listening'){const p=`${d}:${id}:`;return Object.keys(answers(t)).some(k=>k.startsWith(p))}
  const box=t==='writing'?S.writing:t==='speaking'?S.speaking:S.application;
  if(box&&Array.isArray(box.records)&&box.records.some(r=>Number(r.day)===Number(d)&&String(r.contentId||'')===String(id)))return true;
  if((t==='writing'||t==='application')&&S.drafts171&&S.drafts171[t]){const p=`${d}:${t}:`;if(Object.entries(S.drafts171[t]).some(([k,v])=>k.startsWith(p)&&String(v||'').trim()))return true}
  return false;
}
/* Read-only: the audit reports the routing in force and never re-routes (it runs when a page renders). */
function effectiveId(t,d,s){
  const r=replacement(t,d,s);if(r&&r.newId)return r.newId;
  return assignment(t,d)[s]||null;
}
function pushDup(map,key,entry,bucket,kind){if(!key)return;if(map.has(key))bucket.push({kind,first:map.get(key),again:entry});else map.set(key,entry)}
function audit(){
  const report={version:APP,auditVersion:AUDIT,ok:true,unresolved:[],protectedHistorical:[],grammar:{questions:0,exactDuplicates:[]},counts:{},patch:patchResult};
  const grammarSeen=new Map();
  for(const g of GRAMMAR){const qs=typeof grammarQuestions==='function'?grammarQuestions(g):(g.qs||[]);for(let i=0;i<qs.length;i++){const k=norm(qs[i]&&qs[i][0]),at=`${g.id}:${i+1}`;report.grammar.questions++;if(grammarSeen.has(k))report.grammar.exactDuplicates.push({question:qs[i][0],first:grammarSeen.get(k),again:at});else grammarSeen.set(k,at)}}
  for(const t of TYPES){
    const idSeen=new Map(),bodySeen=new Map(),qSeen=new Map();report.counts[t]={slots:0,questions:0};
    for(let d=1;d<=50;d++){
      const limit=d>=3?MAX[t]:Math.min(MAX[t],assignment(t,d).length);
      for(let s=0;s<limit;s++){
        const id=effectiveId(t,d,s);if(!id)continue;const item=find(t,id),at=`D${d}S${s+1}`,prot=isProtected(t,d,s,assignment(t,d)[s]||id),bucket=prot?report.protectedHistorical:report.unresolved;report.counts[t].slots++;
        pushDup(idSeen,String(id),at,bucket,`${t}:content-id`);pushDup(bodySeen,body(t,item),at,bucket,`${t}:body`);
        if((t==='reading'||t==='listening')&&item&&Array.isArray(item.qs))for(let qi=0;qi<item.qs.length;qi++){report.counts[t].questions++;const qk=norm(item.qs[qi]&&item.qs[qi][0]),qat=`${at}Q${qi+1}`;pushDup(qSeen,qk,qat,bucket,`${t}:question`)}
      }
    }
  }
  report.ok=report.unresolved.length===0&&report.grammar.exactDuplicates.length===0;return report;
}
const first=audit();

try{if(typeof KEY!=='undefined')localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
window.DELF50_FULL_AUDIT={version:APP,contentVersion:CONTENT,auditVersion:AUDIT,patchResult,run:audit,initial:first};
if(window.DELF50_NOREPEAT){window.DELF50_NOREPEAT.version=APP;window.DELF50_NOREPEAT.contentVersion=CONTENT;window.DELF50_NOREPEAT.fullAudit=audit}
render();
})();

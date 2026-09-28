function bind(){
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav));
 const pd=document.getElementById('prevDay');if(pd)pd.onclick=()=>setDay(S.selectedDay-1);
 const nd=document.getElementById('nextDay');if(nd)nd.onclick=()=>setDay(S.selectedDay+1);
 const di=document.getElementById('dayInput');if(di)di.onchange=()=>setDay(Number(di.value));
 const it=document.getElementById('intensity');if(it)it.onchange=()=>{S.intensity=it.value;save();render()};
 document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{const k=dayKey(S.selectedDay,b.dataset.task);S.taskDone[k]=!S.taskDone[k];if(!S.startedAt)S.startedAt=new Date().toISOString();save();render()});
 document.querySelectorAll('[data-gnode]').forEach(b=>b.onclick=()=>{UI.gNode=Number(b.dataset.gnode);UI.gQ=0;UI.gSel=null;UI.gAnswered=false;render()});
 document.querySelectorAll('[data-gopt]').forEach(b=>b.onclick=()=>{if(!UI.gAnswered){UI.gSel=Number(b.dataset.gopt);render()}});
 const sg=document.getElementById('submitG');if(sg)sg.onclick=submitGrammar;
 const ng=document.getElementById('nextGQ');if(ng)ng.onclick=()=>{UI.gQ=(UI.gQ+1)%GRAMMAR[UI.gNode].qs.length;UI.gSel=null;UI.gAnswered=false;render()};
 document.querySelectorAll('[data-inputtab]').forEach(b=>b.onclick=()=>{UI.inputTab=b.dataset.inputtab;render()});
 document.querySelectorAll('[data-ropt]').forEach(b=>b.onclick=()=>answerReading(b.dataset.ropt));
 const nr=document.getElementById('nextReading');if(nr)nr.onclick=()=>{S.reading.index=(S.reading.index+1)%READINGS.length;save();render()};
 document.querySelectorAll('[data-lopt]').forEach(b=>b.onclick=()=>answerListening(b.dataset.lopt));
 const nl=document.getElementById('nextListening');if(nl)nl.onclick=()=>{S.listening.index=(S.listening.index+1)%LISTENINGS.length;save();render()};
 const pl=document.getElementById('playListen');if(pl)pl.onclick=playListening;
 const ss=document.getElementById('showScript');if(ss)ss.onclick=()=>{const box=document.getElementById('scriptBox');box.style.display=box.style.display==='none'?'block':'none'};
 document.querySelectorAll('[data-outputtab]').forEach(b=>b.onclick=()=>{UI.outputTab=b.dataset.outputtab;render()});
 const sa=document.getElementById('submitApp');if(sa)sa.onclick=submitApp;
 const sw=document.getElementById('submitWriting');if(sw)sw.onclick=submitWriting;
 const rb=document.getElementById('recBtn');if(rb)rb.onclick=toggleRecording;
 const cs=document.getElementById('completeSpeak');if(cs)cs.onclick=completeSpeaking;
 const eb=document.getElementById('exportBtn');if(eb)eb.onclick=exportBackup;
 const im=document.getElementById('importFile');if(im)im.onchange=importBackup;
 const re=document.getElementById('resetBtn');if(re)re.onclick=resetAll;
 document.querySelectorAll('[data-fixerr]').forEach(b=>b.onclick=()=>{S.errors.splice(Number(b.dataset.fixerr),1);save();render()});
}
function setDay(n){n=Math.max(1,Math.min(50,n||1));S.selectedDay=n;save();render()}
function submitGrammar(){if(UI.gSel===null)return;const g=GRAMMAR[UI.gNode],q=g.qs[UI.gQ];UI.gAnswered=true;S.grammar.attempts++;S.grammar.skill[g.id]=S.grammar.skill[g.id]||{a:0,c:0};S.grammar.skill[g.id].a++;if(UI.gSel===q[2]){S.grammar.correct++;S.grammar.skill[g.id].c++}else{S.errors.unshift({skill:g.name,original:q[1][UI.gSel],correct:q[1][q[2]],why:q[3],at:new Date().toISOString()})}if(!S.startedAt)S.startedAt=new Date().toISOString();save();render()}
function answerReading(k){const [qi,oi]=k.split(':').map(Number),idx=S.reading.index,key=`${idx}:${qi}`;if(S.reading.answers[key]!==undefined)return;const q=READINGS[idx%READINGS.length].qs[qi];S.reading.answers[key]=oi;S.reading.attempts++;if(oi===q[2])S.reading.correct++;save();render()}
function answerListening(k){const [qi,oi]=k.split(':').map(Number),idx=S.listening.index,key=`${idx}:${qi}`;if(S.listening.answers[key]!==undefined)return;const q=LISTENINGS[idx%LISTENINGS.length].qs[qi];S.listening.answers[key]=oi;S.listening.attempts++;if(oi===q[2])S.listening.correct++;save();render()}
function playListening(){const l=LISTENINGS[S.listening.index%LISTENINGS.length];if(!('speechSynthesis'in window)){alert('当前浏览器不支持语音合成。请使用最新版 Chrome / Edge / Safari。');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(l.script);u.lang='fr-FR';u.rate=.9;speechSynthesis.speak(u)}
function submitApp(){const a=APPLICATION[S.application.index%APPLICATION.length],el=document.getElementById('appText'),t=(el.value||'').trim();if(t.length<20){UI.appMsg='内容太短：先写至少 3 句，再保存。';render();return}const low=t.toLowerCase(),hits=a.keys.filter(k=>low.includes(k));S.application.records.push({day:S.selectedDay,title:a.title,text:t,hits,at:new Date().toISOString()});S.application.count++;S.application.index=(S.application.index+1)%APPLICATION.length;UI.appMsg=`已保存。命中 ${hits.length}/${a.keys.length} 个任务关键词。这个检查只判断任务结构，不代表法语水平。`;save();render()}
function wordCount(t){return t.trim().split(/\s+/).filter(Boolean).length}
function submitWriting(){const w=WRITINGS[S.writing.index%WRITINGS.length],t=(document.getElementById('writeText').value||'').trim(),n=wordCount(t);if(!t){UI.writeMsg={ok:false,text:'还没有写作内容。'};render();return}S.writing.records.push({day:S.selectedDay,title:w.title,text:t,words:n,at:new Date().toISOString()});S.writing.count++;S.writing.index=(S.writing.index+1)%WRITINGS.length;UI.writeMsg={ok:n>=w.min,text:`已保存：约 ${n} 词。${n>=w.min?'达到本次最低字数要求，但这不等于写作水平达标。':`当前目标至少 ${w.min} 词，请继续扩展观点、例子和连接。`}`};save();render()}
async function openAudioDB(){return new Promise((res,rej)=>{const req=indexedDB.open(AUDIO_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('clips'))db.createObjectStore('clips',{keyPath:'id'})};req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
async function storeAudio(id,blob){try{const db=await openAudioDB();const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put({id,blob,at:Date.now()});return new Promise((res,rej)=>{tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error)})}catch(e){return false}}
async function getAudio(id){try{const db=await openAudioDB();return await new Promise((res,rej)=>{const q=db.transaction('clips','readonly').objectStore('clips').get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}catch(e){return null}}
async function toggleRecording(){if(UI.recording){stopRecording();return}if(!navigator.mediaDevices||!window.MediaRecorder){alert('当前浏览器不支持网页录音。请使用最新版 Chrome / Edge / Safari，并允许麦克风权限。');return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});UI.media=new MediaRecorder(stream);UI.chunks=[];UI.media.ondataavailable=e=>{if(e.data.size)UI.chunks.push(e.data)};UI.media.onstop=async()=>{const sec=Math.max(1,Math.round((Date.now()-UI.recStart)/1000));const blob=new Blob(UI.chunks,{type:UI.media.mimeType||'audio/webm'});const p=SPEAKING[S.speaking.index%SPEAKING.length],id=`d${S.selectedDay}-s${Date.now()}`;const ok=await storeAudio(id,blob);S.speaking.records.push({id,day:S.selectedDay,title:p.title,sec,stored:ok,at:new Date().toISOString()});S.speaking.totalSec+=sec;S.speaking.count++;save();UI.speakMsg=`录音 ${fmtSec(sec)} 已记录${ok?'并保存到账号':'，但录音保存失败'}。请回听后按任务清单自检。`;stream.getTracks().forEach(t=>t.stop());render()};UI.media.start();UI.recording=true;UI.recStart=Date.now();UI.recTimer=setInterval(()=>{const el=document.getElementById('recTimer');if(el)el.textContent=fmtSec(Math.round((Date.now()-UI.recStart)/1000))},500);render()}catch(e){alert('无法开始录音：'+e.message)}}
function stopRecording(){if(UI.media&&UI.media.state!=='inactive')UI.media.stop();UI.recording=false;if(UI.recTimer)clearInterval(UI.recTimer);UI.recTimer=null}
function completeSpeaking(){const p=SPEAKING[S.speaking.index%SPEAKING.length];S.speaking.records.push({id:null,day:S.selectedDay,title:p.title,sec:0,stored:false,manual:true,at:new Date().toISOString()});S.speaking.count++;S.speaking.index=(S.speaking.index+1)%SPEAKING.length;UI.speakMsg='已记录一次口语任务完成。由于没有可靠自动语音评分，本次不会改变任何“口语能力分数”。';save();render()}
async function loadLatestAudio(){const rec=[...S.speaking.records].reverse().find(x=>x.id);if(!rec)return;const data=await getAudio(rec.id);const area=document.getElementById('audioArea');if(data&&area){const url=URL.createObjectURL(data.blob);area.innerHTML=`<audio controls src="${url}" style="width:100%"></audio><div class="muted">最近一次持久录音：${esc(rec.title)} · ${fmtSec(rec.sec)}</div>`}}
function exportBackup(){const data={app:'DELF50',version:VERSION,exportedAt:new Date().toISOString(),state:S,note:'口语音频保存在浏览器 IndexedDB 中，不包含在 JSON 备份内。'};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`delf50-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importBackup(e){const f=e.target.files&&e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(rd.result);if(!x.state)throw Error('备份格式不正确');S=Object.assign(fresh(),x.state);S.version=VERSION;save();alert('学习备份已导入。');render()}catch(err){alert('导入失败：'+err.message)}};rd.readAsText(f)}
function resetAll(){if(confirm('这会把学习状态重置为全0。口语录音不会自动删除。确定吗？')){S=fresh();save();render()}}
if(UI.inputTab===undefined)UI.inputTab='reading';if(UI.outputTab===undefined)UI.outputTab='writing';
render();
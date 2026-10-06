'use strict';
/* DELF50 · v201 · Day 1–4 的两个显示层问题
 *
 * 本层只做两件事，都不写 S，不改题库里的题目与答案下标：
 *
 * 1) 配额满了以后，同一篇材料被反复端上来
 *    v174 的 dayCursorBox174() 在 done >= target 时把游标设为 done-1，
 *    也就是指回「最后一篇已完成的」。于是 Day 1 做满 3 篇后，第 3 篇（或按强度
 *    不同为第 4 篇）会被一再显示，而 assignments172 里排在后面的那一篇
 *    （Day 1 是 r16-01）永远走不到。学习档案按 assignments 列出 4 篇、
 *    completed 只有 3 篇，页面却在重复其中一篇 —— 这就是「第四篇重复出现、
 *    且与学习档案不符」的来源。
 *    改法：游标默认指向「第一篇尚未作答的」；全部作答完才停在最后一篇。
 *    只改默认落点，不动 assignments172，也不动任何计数器。
 *
 * 2) 旧生成层把开发脚手架当成课文
 *    v187 的 makeGeneric() 产出的 Day 3 正文不是法语，是模板：
 *      « Lucie doit prendre une décision dans une situation liée à service »
 *        —— topic 键直接插进句子，缺冠词（应为 au service）
 *      « Le premier élément concerne rendez-vous; le deuxième porte sur disponible »
 *        —— 词表项直接插进句子，全部缺限定词
 *      第三段是所有材料共用的固定说明，并点名当日语法
 *    v177 则在每篇末尾附一句 « Le dossier porte la référence XXX. »
 *    这些对学习者是纯噪音，而且是错误的法语示范。
 *
 *    这些槽位已由 corpus-v200-d03.js 换成逐篇撰写的材料；本层只是兜底：
 *    若仍有生成稿到达渲染层，只在渲染时删掉脚手架句、补回缺失的冠词，
 *    不改题干、不改选项、不改任何存储内容。删除是保守的：只删整句模板。
 */
(function(){
var ROUTE_201 = 'day-navigation-legacy-text-v1';
var report = {route: ROUTE_201, cursorFixed: 0, sanitized: 0};

/* ---------- 1. 游标：指向第一篇未作答的材料 ---------- */
function answersBox201(type){ return type === 'reading' ? S.reading : type === 'listening' ? S.listening : null; }
function answeredAny201(type, day, id){
  var box = answersBox201(type);
  var a = (box && box.answers) || {}, p = String(day) + ':' + String(id) + ':';
  for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k.indexOf(p) === 0) return true;
  return false;
}
function assignedIds201(type, day){
  var box = S.assignments172 && S.assignments172[String(day)];
  var list = box && box[type];
  return Array.isArray(list) ? list : [];
}
/* 第一篇尚未作答的序号；全部作答过则返回 -1 */
function firstUnanswered201(type, day){
  var list = assignedIds201(type, day);
  for (var i = 0; i < list.length; i++) if (!answeredAny201(type, day, list[i])) return i;
  return -1;
}

/* 今天这一类型到底安排了几篇：以当前强度的配额为准。
   assignments172 里通常比配额多一条（路由缓冲，供切换强度时备用）。
   v174 只让游标走到 done-1，那一条既走不到，又出现在学习档案的「已分配」里，
   于是档案显示 5 篇已分配 / 4 篇已完成，而页面把第 4 篇一再端上来。 */
function quotaOf201(type){
  try { var q = (typeof quota === 'function') ? quota() : null; var n = Number(q && q[type]); return n > 0 ? n : 0; }
  catch (e) { return 0; }
}
function planCount201(type, day){
  var assigned = assignedIds201(type, day).length, q = quotaOf201(type);
  if (!assigned) return 0;
  return q > 0 ? Math.min(assigned, q) : assigned;
}
function maxIndex201(type, day){
  var n = planCount201(type, day);
  return n ? n - 1 : 0;
}
/* 落点：今天计划内第一篇尚未作答的；全部做完则停在最后一篇（v174 会标为「已完成 · 回看」） */
function preferredIndex201(type, day){
  var list = assignedIds201(type, day), n = planCount201(type, day);
  for (var i = 0; i < n; i++) if (!answeredAny201(type, day, list[i])) return i;
  return Math.max(0, n - 1);
}
function setCursor201(type, day, n){
  UI.browse174 = UI.browse174 || {};
  var box = UI.browse174[type] || (UI.browse174[type] = {});
  box[String(day)] = Math.max(0, Math.min(maxIndex201(type, day), Number(n) || 0));
}

/* 打开某一天时，若没有显式导航过，落到计划内第一篇未作答的材料上。
   注意这里只改「落在哪一篇」，不碰 daily 计数、不碰 assignments172、
   不调用 completeReading —— 所以任何计数器都不会因为浏览而增加。 */
['reading', 'listening'].forEach(function(type){
  var name = type === 'reading' ? 'currentReading' : 'currentListening';
  if (typeof globalThis[name] !== 'function') return;
  var prev = globalThis[name];
  globalThis[name] = function(){
    try {
      var day = String(S.selectedDay);
      UI.browse174 = UI.browse174 || {};
      var box = UI.browse174[type] || (UI.browse174[type] = {});
      var want = preferredIndex201(type, S.selectedDay);
      if (!planCount201(type, S.selectedDay)) return prev.apply(this, arguments);
      /* 只决定「没有导航过时落在哪一篇」。显式导航（分页按钮、回看、外部调用）
         写进来的序号一律尊重，不在这里夹取 —— 夹取会让低强度下第 4 篇彻底取不到。 */
      if (!Number.isInteger(box[day])){ box[day] = want; report.cursorFixed++; }
    } catch (e) { /* 出错就退回原有行为，不让导航把页面弄崩 */ }
    return prev.apply(this, arguments);
  };
});

/* 学习档案读的是 DELF50_ARCH.getAssignments()。它返回的是深拷贝，这里把每一类
   截到当天计划篇数，档案里的「已分配」就与「已完成」和页面上的 x/N 一致，
   不再出现「已分配 5 篇、已完成 4 篇、第 4 篇反复出现」。存储里的
   S.assignments172 一个字节都不动 —— 缓冲条目仍在，切换强度时照样可用。 */
if (globalThis.DELF50_ARCH && typeof globalThis.DELF50_ARCH.getAssignments === 'function'){
  var getAssignPrev201 = globalThis.DELF50_ARCH.getAssignments;
  globalThis.DELF50_ARCH.getAssignments = function(day){
    var d = (day === undefined ? S.selectedDay : day);
    var box = getAssignPrev201.apply(this, arguments);
    try {
      ['reading', 'listening'].forEach(function(type){
        if (!Array.isArray(box[type])) return;
        var n = planCount201(type, d);
        if (n && box[type].length > n) box[type] = box[type].slice(0, n);
      });
    } catch (e) { return box; }
    return box;
  };
}

/* 「下一篇 →」接管点击，用计划内上限重新计算落点。到最后一篇时按钮本就是禁用的，
   这里不放开它 —— 今天的计划做完了就是做完了，不该再冒出第 5 篇。 */
if (typeof bind === 'function'){
  var bindPrev201 = bind;
  bind = function(){
    bindPrev201();
    try {
      document.querySelectorAll('[data-input-page174]').forEach(function(b){
        var type = b.dataset.inputPage174, step = Number(b.dataset.step174 || 0);
        if (!planCount201(type, S.selectedDay)) return;
        b.onclick = function(){
          var box = (UI.browse174 && UI.browse174[type]) || {};
          setCursor201(type, S.selectedDay, Number(box[String(S.selectedDay)] || 0) + step);
          if (typeof render === 'function') render();
        };
      });
    } catch (e) { /* 保留 v174 原有绑定 */ }
  };
}

/* ---------- 2. 渲染层：删掉旧生成层的脚手架 ---------- */

/* v187 的固定收尾段，所有 makeGeneric 材料共用，且点名当日语法 */
var BOILERPLATE_187 = /La décision finale n['’]est donc pas fondée sur un seul mot du texte\s*[:：][\s\S]*?(?=<\/p>|<br\s*\/?>\s*<br|$)/gi;
/* v177 在正文末尾附的内部编号句 */
var DOSSIER_REF_177 = /\s*(?:Le dossier porte la|votre dossier porte la|Le dossier porte|et votre dossier porte la)\s+référence\s+[^.<]{1,40}\.?/gi;
/* v181 的关键词倾倒句 */
var KEYWORDS_181 = /\s*Les mots-clés du dossier sont[^.<]{0,120}\.?/gi;

/* v181 的开场脚手架：五种变体，都是「这份材料是干什么用的」的元叙述，
   把 seed 的 angle 键用书名号原样引出来。删掉后正文直接从事实句开始。 */
var SCAFFOLD_OPEN_181 = [
  /(?:Dans le dossier[^,]{0,20},\s*)?[Uu]ne personne cherche à comprendre une information pratique concernant\s*«[^»]{1,80}»\s*\.\s*/g,
  /(?:Le dossier\s+)?[^.]{0,30}présente une situation concrète liée à\s*«[^»]{1,80}»\s*et demande de distinguer la règle de la démarche à suivre\.\s*/g,
  /Pour préparer une décision,\s*(?:le dossier\s+)?[^.]{0,30}rassemble une information officielle sur\s*«[^»]{1,80}»\s*et un cas d['’]usage\.\s*/g,
  /Deux solutions sont envisagées(?:\s+dans le dossier[^;]{0,20})?\s*;\s*l['’]information de référence porte sur\s*«[^»]{1,80}»\s*\.\s*/g,
  /(?:Le dossier\s+)?[^.]{0,30}sert à expliquer à un proche une information publique concernant\s*«[^»]{1,80}»\s*\.\s*/g
];
/* v181 的收尾脚手架：点名词表项、或直接给出学习指令，都是元语言 */
var SCAFFOLD_CLOSE_181 = [
  /\s*La personne veut vérifier ce point avant d['’]envoyer une demande et note les mots\s*«[^»]{1,60}»\s*et\s*«[^»]{1,60}»\s*pour préparer son message\.\s*/g,
  /\s*Après lecture, elle doit expliquer la démarche avec ses propres mots, puis décider quelle information demander au service concerné\.\s*/g,
  /\s*Elle compare ce point avec sa situation, cherche un justificatif utile et prépare une question claire avant de poursuivre\.\s*/g,
  /\s*Elle doit maintenant comparer les conséquences possibles, expliquer son choix et éviter de confondre information générale et cas particulier\.\s*/g,
  /\s*Enfin, elle reformule l['’]idée essentielle pour quelqu['’]un qui n['’]a pas lu la fiche et[^.<]{0,80}\.\s*/g
];
/* v181 听力的开场同样是编号播报 */
var SCAFFOLD_OPEN_LISTEN_181 = [
  /Bonjour\.\s*Vous écoutez le message\s*(?:[A-Z]\d{2}-\d+\s*)?au sujet de\s*«[^»]{1,80}»\s*\.\s*/g,
  /Dans notre chronique pratique\s*(?:[A-Z]\d{2}-\d+\s*)?,?\s*nous revenons aujourd['’]hui sur\s*«[^»]{1,80}»\s*\.\s*/g,
  /Annonce\s*(?:[A-Z]\d{2}-\d+)?\s*\.\s*Une information importante concerne\s*«[^»]{1,80}»\s*\.\s*/g
];

/* topic / lexique 键被直接插进句子后缺限定词。只补冠词，不改事实。 */
var ARTICLE_FIXES = [
  [/\bliée? à service\b/gi, function(m){ return m.replace(/à service/i, 'au service'); }],
  [/\bdans un contexte de service\b/gi, 'dans un contexte de service à la clientèle'],
  [/\bune situation de service\b/gi, 'une situation de service à la clientèle'],
  [/\bconcerne rendez-vous\b/gi, 'concerne le rendez-vous'],
  [/\bporte sur disponible\b/gi, 'porte sur les disponibilités'],
  [/\bprécise d[’']abord rendez-vous\b/gi, 'précise d’abord le rendez-vous'],
  [/\bdonne un détail sur disponible\b/gi, 'donne un détail sur les disponibilités'],
  [/\bune information sur formulaire\b/gi, 'une information sur le formulaire'],
  [/\bconcernant formulaire\b/gi, 'concernant le formulaire'],
  [/\bune conséquence sur confirmation\b/gi, 'une conséquence sur la confirmation'],
  [/\bvérifier confirmation\b/gi, 'vérifier la confirmation'],
  [/\bmentionnent rendez-vous et disponible\b/gi, 'mentionnent le rendez-vous et les disponibilités'],
  [/\bvérifier formulaire\b/gi, 'vérifier le formulaire'],
  [/\btenir compte de confirmation\b/gi, 'tenir compte de la confirmation'],
  [/\bintéressante pour rendez-vous\b/gi, 'intéressante pour le rendez-vous'],
  [/\brépond mieux à disponible\b/gi, 'répond mieux aux disponibilités'],
  [/\bcompare aussi formulaire et confirmation\b/gi, 'compare aussi le formulaire et la confirmation']
];

/* 体裁元标签：« Service et demandes polies · situation pratique » 里 « · 体裁 » 是
   出题者的元语言，学生界面上不该出现。只在 <h2> 标题里去掉，正文不动。 */
var GENRE_TAIL = /(<h2[^>]*>)([^<]*?)\s*·\s*(?:situation pratique|courriel|article court|comparaison|forum|annonce|FAQ|comparatif|reportage|entretien|témoignage)\s*(<\/h2>)/gi;
/* « Avis pratique · dépôt de garantie » —— 体裁在前，真正的标题在后。
   « Avis pratique » 是出题者的分类名，学生界面上留下后半段即可。 */
var GENRE_HEAD = /(<h2[^>]*>)\s*(?:Avis pratique|Fiche pratique|Message téléphonique|Chronique pratique|Annonce pratique|Note pratique|Dialogue pratique|Reportage pratique|Service et demandes polies|Échanges de service|Ville, achats et quantités|Personnes et lieux culturels)\s*·\s*([^<]{2,})(<\/h2>)/gi;
function upperFirst201(x){ return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }

function sanitize201(html){
  var s = String(html == null ? '' : html);
  var before = s;
  s = s.replace(BOILERPLATE_187, '');
  s = s.replace(DOSSIER_REF_177, '');
  s = s.replace(KEYWORDS_181, '');
  SCAFFOLD_OPEN_181.forEach(function(re){ s = s.replace(re, ''); });
  SCAFFOLD_CLOSE_181.forEach(function(re){ s = s.replace(re, ''); });
  SCAFFOLD_OPEN_LISTEN_181.forEach(function(re){ s = s.replace(re, ''); });
  for (var i = 0; i < ARTICLE_FIXES.length; i++) s = s.replace(ARTICLE_FIXES[i][0], ARTICLE_FIXES[i][1]);
  s = s.replace(GENRE_TAIL, '$1$2$3');
  s = s.replace(GENRE_HEAD, function(m, a, title, b){ return a + upperFirst201(String(title).trim()) + b; });
  /* 删句后可能留下空段落或连续的 <br> */
  s = s.replace(/<p[^>]*>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '');
  s = s.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
  if (s !== before) report.sanitized++;
  return s;
}

['readingView', 'listeningView'].forEach(function(n){
  if (typeof globalThis[n] !== 'function') return;
  var prev = globalThis[n];
  globalThis[n] = function(){ return sanitize201(prev.apply(this, arguments)); };
});
['writingView', 'speakingView', 'applicationView'].forEach(function(n){
  if (typeof globalThis[n] !== 'function') return;
  var prev = globalThis[n];
  globalThis[n] = function(){ return sanitize201(prev.apply(this, arguments)); };
});

globalThis.__DELF50_DAY_NAV_201 = report;
if (typeof render === 'function') render();
})();

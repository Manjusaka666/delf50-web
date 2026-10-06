'use strict';
/* DELF50 · v200-corpus-materials
 *
 * 职责
 *   1. 把 content/corpus-v200.js 中逐篇撰写的材料装载到题库对应槽位。
 *   2. 装载前对语料做阻断式校验：不合格的条目直接跳过，不写入题库。
 *   3. 一篇材料的内容只由它的 content id 决定，与学习者是否作答无关。
 *   4. 不修改 S 的任何字段；装载前后对学习证据做快照比对，不一致立即回滚并中止。
 *
 * 为什么不按作答记录「冻结」
 *   题库对象每次启动都由各层重新生成，从不持久化。学习者第一次打开一篇材料时，它一定
 *   还没有作答记录，看到的就是本层装载后的版本，答案下标也是对着这个版本存的。若下一次
 *   启动时因为「已作答」而跳过装载，题库里留下的是上一层的生成稿——学习者从未见过的旧题，
 *   已存的下标指向另一组选项。所以装载与洗牌对每个条目无条件执行：同一 id 在任何设备、
 *   任何一次启动都得到同一份内容，这才是「学过的内容不变」。
 *   5. 承接原 v199 的显示层清洗（开发端编号不得进入学生界面）。
 *
 * 与既有层的关系
 *   本层排在 v189 之后。未被语料覆盖的日期与模块保持既有层的产出，不受影响。
 */
(function(){
var REL = globalThis.__DELF50_RELEASE || {};
var ROUTE = 'corpus-authored-v1';
var CORPUS = Array.isArray(globalThis.__DELF50_CORPUS_V200) ? globalThis.__DELF50_CORPUS_V200 : [];
var TYPE = {r:'reading', l:'listening', w:'writing', s:'speaking', a:'application'};
/* Two id generations coexist for every day/slot: 177 and 181. Which one a learner
   is routed to depends on the layer stack (v181 re-routes what v177 had assigned),
   and getAssignments() does not always agree with currentReading(). Rather than bet
   on one, the corpus is applied to both twins of a slot. A learner only ever sees
   one of them, so this does not duplicate anything on screen; it does guarantee the
   authored text is reachable whichever generation the routing resolves to. Each
   twin carries the same authored text and the same option order. */
var GENERATIONS = ['177', '181'];
var LETTER = {reading:'r', listening:'l', writing:'w', speaking:'s', application:'a'};
var MAX = {reading:4, listening:4, writing:2, speaking:4, application:4};

function pad(n){ return String(n).length < 2 ? '0' + n : String(n); }
function bank(t){
  if (t === 'reading')     return typeof V13_READINGS   !== 'undefined' ? V13_READINGS   : READINGS;
  if (t === 'listening')   return typeof V13_LISTENINGS !== 'undefined' ? V13_LISTENINGS : LISTENINGS;
  if (t === 'writing')     return typeof V13_WRITINGS   !== 'undefined' ? V13_WRITINGS   : WRITINGS;
  if (t === 'speaking')    return typeof V13_SPEAKING   !== 'undefined' ? V13_SPEAKING   : SPEAKING;
  return typeof V13_APPLICATION !== 'undefined' ? V13_APPLICATION : APPLICATION;
}
function itemIds(t, d, s){
  return GENERATIONS.map(function(g){ return LETTER[t] + g + '-d' + pad(d) + '-s' + pad(s); });
}
function find(t, id){
  var b = bank(t);
  for (var i = 0; i < b.length; i++) if (String(b[i].id) === id) return b[i];
  return null;
}

/* 该 id 在这一天是否已有作答（导航用：不把已答完的材料当作待做） */
function answerEvidence(t, d, id){
  if (t !== 'reading' && t !== 'listening') return false;
  var box = (t === 'reading' ? S.reading : S.listening);
  var a = (box && box.answers) || {}, p = String(d) + ':' + String(id) + ':';
  for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k.indexOf(p) === 0) return true;
  return false;
}
/* ---------- 学习证据快照：本层不应使其发生任何变化 ---------- */
function evidenceSnapshot(){
  try {
    return JSON.stringify({
      daily: S.daily,
      taskDone: S.taskDone,
      reading: S.reading && S.reading.answers,
      listening: S.listening && S.listening.answers,
      writing: S.writing && S.writing.records,
      speaking: S.speaking && S.speaking.records,
      application: S.application && S.application.records,
      drafts: S.drafts171,
      assignments: S.assignments172,
      replacements: S.replacements177,
      completed: S.contentProgress172 && S.contentProgress172.completed
    });
  } catch (e) { return 'snapshot-error'; }
}

/* ---------- 语料校验：不合格条目不写入题库 ---------- */
var LEAK_RE = /\b(?:traceId|sourceSeed|contentId|familyId|semanticFingerprint|slot\s*\d+|[rlwsa](?:177|181)-d\d{2}-s\d{2}|Dossier\s+[RLWSA]\d{2}-\d+|Audio\s+[RL]\d{2}-\d+)\b/i;

function plain(s){ return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function norm(s){ return plain(s).toLowerCase().replace(/[^a-zà-ÿ0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim(); }
function words(s){ return norm(s).split(' ').filter(Boolean).length; }
/* ---------- 选项位置随机化 ----------
 * 手写语料里正确项一律写在第一位，方便撰写和校对。若原样装载，学习者只要每题
 * 都点第一个选项就能拿满分，题目变成纯位置匹配，和理解无关。
 *
 * 随机源不能是渲染期的 Math.random()：S.reading.answers 存的是选项下标，
 * 每次渲染重排会让学习者昨天的答题记录指向另一个选项，正确率与错题本全部错乱。
 * 因此这里做一次性洗牌，随机源是题目内容本身的哈希 —— 位置分布均匀且不可预测
 * （没有 %3 那样的可见周期），但同一道题在任何设备、任何会话、任何一次重新部署
 * 下都得到同一个排列。种子只取题干与正确项原文，不含 day/slot/id，所以同一条
 * 材料的 177 / 181 两代 id 必然洗出相同结果，语料换文件或换日期也不会漂移。
 */
function seedOf(str){                       /* FNV-1a 32 位 */
  var h = 0x811c9dc5, s = String(str);
  for (var i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function rngOf(seed){                       /* xorshift32 */
  var x = (seed >>> 0) || 0x9e3779b9;
  return function(){
    x ^= (x << 13); x >>>= 0;
    x ^= (x >>> 17);
    x ^= (x << 5);  x >>>= 0;
    return x / 4294967296;
  };
}
/* 返回洗牌后的 [选项数组, 正确项新下标]；任何异常情况下原样返回，绝不丢失正确项。 */
function shuffled(stem, options, key){
  if (!Array.isArray(options) || !(key >= 0 && key < options.length)) return [options, key];
  var correct = options[key], out = options.slice();
  var rnd = rngOf(seedOf(norm(stem) + '|' + norm(correct)));
  for (var i = out.length - 1; i > 0; i--){
    var j = Math.floor(rnd() * (i + 1));
    if (!(j >= 0)) j = 0;
    if (j > i) j = i;
    var t = out[i]; out[i] = out[j]; out[j] = t;
  }
  var at = out.indexOf(correct);
  if (at < 0) return [options, key];         /* 理论上不可达：选项已校验互不相同 */
  return [out, at];
}

function validate(entry, seen){
  var problems = [];
  var t = TYPE[entry.t];
  if (!t) { problems.push('type inconnu'); return problems; }
  if (!(entry.d >= 1 && entry.d <= 50)) problems.push('jour hors plage');
  if (!(entry.s >= 1 && entry.s <= MAX[t])) problems.push('slot hors plage');
  var body = t === 'listening' ? entry.script : t === 'reading' ? entry.text : entry.prompt;
  if (!body || words(body) < 45) problems.push('texte trop court');
  if (!entry.title) problems.push('titre manquant');

  var visible = [entry.title, body].concat((entry.qs || []).reduce(function(acc, q){
    return acc.concat([q[0]]).concat(q[1] || []);
  }, [])).join(' ');
  if (LEAK_RE.test(visible)) problems.push('marqueur de développement visible');

  if (t === 'reading' || t === 'listening'){
    if (!Array.isArray(entry.qs) || entry.qs.length < 3) problems.push('moins de 3 questions');
    (entry.qs || []).forEach(function(q, i){
      if (!q[0]) problems.push('Q' + (i+1) + ' sans énoncé');
      if (!Array.isArray(q[1]) || q[1].length < 3) problems.push('Q' + (i+1) + ' moins de 3 options');
      if (!(q[2] >= 0 && q[2] < (q[1] || []).length)) problems.push('Q' + (i+1) + ' index de réponse invalide');
      var uniq = {};
      (q[1] || []).forEach(function(o){ uniq[norm(o)] = 1; });
      if (Object.keys(uniq).length !== (q[1] || []).length) problems.push('Q' + (i+1) + ' options identiques');
    });
    var stems = {};
    (entry.qs || []).forEach(function(q){ stems[norm(q[0])] = 1; });
    if (Object.keys(stems).length !== (entry.qs || []).length) problems.push('énoncés répétés dans la même activité');
  }

  /* 同类型内文本完全重复 */
  var key = t + '|' + norm(body);
  if (seen.body[key]) problems.push('texte identique à ' + seen.body[key]);

  /* 同一天跨模态主题重复：阅读与听力不得使用同一 domain */
  var dk = entry.d + '|' + String(entry.domain || '').toLowerCase();
  if ((t === 'reading' || t === 'listening') && seen.domain[dk] && seen.domain[dk] !== t){
    problems.push('même domaine que ' + seen.domain[dk] + ' le même jour');
  }
  return problems;
}

/* ---------- 装载 ---------- */
var audit = {
  route: ROUTE, app: REL.app, content: REL.content,
  corpusSize: CORPUS.length,
  applied: [], missing: [], rejected: [],
  coverage: {}, keyPositions: {}, answerBalance: null, balanced: 0, status: 'pass'
};

var before = evidenceSnapshot();
var restorePoints = [];
var seen = {body: {}, domain: {}};
var applicable = [];

CORPUS.forEach(function(entry){
  var t = TYPE[entry.t];
  var problems = validate(entry, seen);
  if (problems.length){
    audit.rejected.push({day: entry.d, slot: entry.s, type: t || entry.t, problems: problems});
    return;
  }
  var body = t === 'listening' ? entry.script : entry.text;
  seen.body[t + '|' + norm(body)] = 'D' + entry.d + 'S' + entry.s;
  if (t === 'reading' || t === 'listening') seen.domain[entry.d + '|' + String(entry.domain || '').toLowerCase()] = t;
  applicable.push(entry);
});

applicable.forEach(function(entry){
  var t = TYPE[entry.t], ids = itemIds(t, entry.d, entry.s), found = 0;
  ids.forEach(function(id){ if (find(t, id)) found++; });
  if (!found){ audit.missing.push(ids.join('/')); return; }
  ids.forEach(function(id){ applyTo(entry, t, id); });
});

function applyTo(entry, t, id){
  var item = find(t, id);
  if (!item) return;

  var patch = {title: entry.title};
  if (t === 'reading')        patch.text   = entry.text;
  else if (t === 'listening') patch.script = entry.script;
  else                        patch.prompt = entry.prompt;

  if (Array.isArray(entry.qs)){
    patch.qs = entry.qs.map(function(q, i){
      var mix = shuffled(q[0], q[1], q[2]);
      audit.keyPositions[mix[1]] = (audit.keyPositions[mix[1]] || 0) + 1;
      return [q[0], mix[0].slice(), mix[1], q[3] || '', {
        kind: 'original', author: 'DELF50', route: ROUTE, questionIndex: i + 1
      }];
    });
  }
  patch.provenance = {
    kind: 'original',
    author: 'DELF50',
    route: ROUTE,
    note: "Texte original rédigé pour ce parcours. Calibrage : format et typologie de questions DELF B1 (France Éducation international), niveau CEFR indiqué. Aucun extrait d'examen ni d'article de presse n'est reproduit.",
    genre: entry.genre || '',
    domain: entry.domain || '',
    level: entry.level || '',
    curriculumDay: entry.d
  };
  if (entry.src && entry.src.label) patch.sourceRef = {label: entry.src.label, url: entry.src.url || ''};
  patch.quality200 = {route: ROUTE, genre: entry.genre, domain: entry.domain, level: entry.level, words: words(t === 'listening' ? entry.script : entry.text)};

  var keys = Object.keys(patch), snapshot = {};
  for (var i = 0; i < keys.length; i++) snapshot[keys[i]] = item[keys[i]];
  restorePoints.push({item: item, before: snapshot});
  for (var i = 0; i < keys.length; i++) item[keys[i]] = patch[keys[i]];

  audit.applied.push(id);
  audit.coverage[t] = (audit.coverage[t] || 0) + 1;
}

/* 学习证据不得因本层发生任何变化 */
if (before !== evidenceSnapshot()){
  /* This layer only writes to bank objects, never to S, so this branch should be
     unreachable. If it ever fires, the learner keeps a working app on the previous
     content rather than losing the app entirely to a thrown bundle error. */
  restorePoints.forEach(function(p){
    var keys = Object.keys(p.before);
    for (var i = 0; i < keys.length; i++){
      if (p.before[keys[i]] === undefined) delete p.item[keys[i]];
      else p.item[keys[i]] = p.before[keys[i]];
    }
  });
  audit.status = 'aborted-evidence-changed';
  audit.applied = [];
  globalThis.__DELF50_CORPUS_AUDIT = audit;
  if (typeof console !== 'undefined' && console.error) console.error('v200: content load rolled back, learning evidence must not change');
  return;
}

/* ---------- 语料未覆盖的日期（Day 1–2 等）同样要打散正确项位置 ----------
 * 语料只覆盖 Day 3–50。更早的生成层产出的条目实测 76% 的正确项落在第一位，
 * 新用户照样能靠「一律点第一个」拿到大部分分数，所以对语料没动过的条目补一次同样的
 * 洗牌。与装载一样无条件执行：学习者作答时看到的就是洗牌后的顺序。
 */
(function balanceRest(){
  var done = {};
  audit.applied.forEach(function(id){ done[id] = 1; });
  ['reading', 'listening'].forEach(function(t){
    var b = bank(t);
    if (!Array.isArray(b)) return;
    b.forEach(function(item){
      if (!item || !Array.isArray(item.qs)) return;
      if (done[String(item.id)]) return;                 /* 语料已处理，别洗第二次 */
      item.qs = item.qs.map(function(q){
        if (!Array.isArray(q) || !Array.isArray(q[1])) return q;
        var mix = shuffled(q[0], q[1], q[2]);
        audit.keyPositions[mix[1]] = (audit.keyPositions[mix[1]] || 0) + 1;
        var out = q.slice();
        out[1] = mix[0];
        out[2] = mix[1];
        return out;
      });
      audit.balanced++;
    });
  });
})();

/* 正确项位置必须接近均匀。偏斜意味着题目可以靠固定位置解出来，与理解无关，
   所以它和「重复」「泄漏」一样是内容质量的一等指标，进审计并对外可见。 */
(function(){
  var counts = audit.keyPositions, slots = Object.keys(counts);
  var total = slots.reduce(function(n, k){ return n + counts[k]; }, 0);
  if (!total) return;
  var expected = total / Math.max(slots.length, 1), worst = 0;
  slots.forEach(function(k){
    var dev = Math.abs(counts[k] - expected) / expected;
    if (dev > worst) worst = dev;
  });
  audit.answerBalance = {
    total: total,
    positions: JSON.parse(JSON.stringify(counts)),
    maxShare: Number((Math.max.apply(null, slots.map(function(k){ return counts[k]; })) / total).toFixed(4)),
    maxDeviation: Number(worst.toFixed(4)),
    ok: worst <= 0.20
  };
})();

audit.status = (audit.rejected.length || audit.missing.length
  || (audit.answerBalance && !audit.answerBalance.ok)) ? 'warn' : 'pass';

/* ---------- 显示层清洗（承接原 v199 行为） ---------- */
function clean(h){
  h = String(h == null ? '' : h);
  h = h.replace(/<details class="prov"[\s\S]*?<\/details>/gi, '');
  h = h.replace(/(?:Dossier\s+[RLWSA]\d{2}-\d+|Audio\s+[RL]\d{2}-\d+)\s*[—–:-]?\s*/gi, '');
  h = h.replace(/\b[rlwsa](?:177|181)-d\d{2}-s\d{2}\b/gi, '');
  h = h.replace(/\b(?:traceId|sourceSeedIds?|contentId|familyId|semanticFingerprint)\b\s*[:：]?\s*[^<\n]*/gi, '');
  return h;
}
function esc200(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

/* Une source citée qui reste invisible n'est pas une source : elle est affichée. */
function sourceBlock200(item){
  var ref = item && item.sourceRef;
  if (!ref || !ref.label) return '';
  var link = ref.url ? '<a href="' + esc200(ref.url) + '" target="_blank" rel="noopener">' + esc200(ref.label) + '</a>' : esc200(ref.label);
  return '<div class="card"><div class="source"><b>校准参照 / Référence de calibrage</b><br>' + link
    + '<br>本篇课文为本课程原创撰写，按该机构公开材料的体裁、语域与事实口径校准；不转载、不改写其任何具体文章。链接指向该机构的公开站点，可作为同类真实材料的延伸阅读。</div></div>';
}

/* L'audio de l'application est une synthèse vocale : on indique où écouter du vrai. */
var LIVE_AUDIO_200 = '<div class="card"><div class="source"><b>真实法语音频 / Écoute authentique</b><br>'
  + '<a href="https://francaisfacile.rfi.fr/fr/" target="_blank" rel="noopener">RFI · Journal en français facile</a>（每日新闻，附转写，A2–B1）'
  + ' · <a href="https://apprendre.tv5monde.com/fr/exercices" target="_blank" rel="noopener">TV5MONDE · Apprendre le français</a>（分级练习，含 B1）'
  + '<br>本页音频由浏览器语音合成生成，用于精听训练；每天再听一段真实录音，语音适应会明显更快。</div></div>';

if (typeof globalThis.readingView === 'function'){
  var prevReading200 = globalThis.readingView;
  globalThis.readingView = function(x){ return clean(prevReading200.apply(this, arguments)) + sourceBlock200(x); };
}
if (typeof globalThis.listeningView === 'function'){
  var prevListening200 = globalThis.listeningView;
  globalThis.listeningView = function(x){ return clean(prevListening200.apply(this, arguments)) + sourceBlock200(x) + LIVE_AUDIO_200; };
}
['writingView','speakingView','applicationView'].forEach(function(n){
  if (typeof globalThis[n] === 'function'){
    var prev = globalThis[n];
    globalThis[n] = function(){ return clean(prev.apply(this, arguments)); };
  }
});

/* Ne jamais présenter comme « à faire » un document déjà entièrement répondu. */
if (typeof globalThis.currentReading === 'function' && typeof globalThis.currentListening === 'function'){
  ['reading','listening'].forEach(function(t){
    var name = t === 'reading' ? 'currentReading' : 'currentListening';
    var prev = globalThis[name];
    var LETTER200 = t === 'reading' ? 'r' : 'l';
    /* Days 3+ have their own curriculum documents. If the routing ever falls back to
       the pre-curriculum bank — an assignment map lost or truncated in the browser —
       the learner would silently be handed day-1 material. Prefer the document that
       belongs to the day and slot whenever it exists. */
    function canonical200(day, slot){
      if (Number(day) < 3) return null;
      var suffix = '-d' + pad(day) + '-s' + pad(slot + 1);
      for (var g = 0; g < GENERATIONS.length; g++){
        var hit = find(t, LETTER200 + GENERATIONS[g] + suffix);
        if (hit) return hit;
      }
      return null;
    }
    globalThis[name] = function(){
      var item = prev.apply(this, arguments);
      var manual = UI && UI.browse174 && UI.browse174[t] && UI.browse174[t][String(S.selectedDay)];
      if (item && !/-d\d{2}-s\d{2}$/.test(String(item.id))){
        var slot = Number.isInteger(manual) ? manual : Number((S.daily && S.daily[String(S.selectedDay)] && S.daily[String(S.selectedDay)][t]) || 0);
        var better = canonical200(S.selectedDay, slot);
        if (better) return better;
      }
      if (Number.isInteger(manual)) return item;      /* navigation explicite : on respecte */
      for (var guard = 0; guard < MAX[t] && item && answerEvidence(t, S.selectedDay, item.id); guard++){
        UI.browse174 = UI.browse174 || {};
        UI.browse174[t] = UI.browse174[t] || {};
        var next = Number(UI.browse174[t][String(S.selectedDay)] || 0) + 1;
        if (next >= MAX[t]) { delete UI.browse174[t][String(S.selectedDay)]; return item; }
        UI.browse174[t][String(S.selectedDay)] = next;
        item = prev.apply(this, arguments);
      }
      return item;
    };
  });
}

globalThis.__DELF50_CORPUS_AUDIT = audit;
if (typeof render === 'function') render();
})();

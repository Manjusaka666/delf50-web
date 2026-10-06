'use strict';
(function(){
const APP='1.8.2',CONTENT='1.8.1',UI_ROUTE='student-ui-clean-v3';
function cleanToday183(html){
  try{
    const t=document.createElement('template');
    t.innerHTML=String(html||'');
    // 保留唯一的“今日计划 / 今日训练”总览，只移除按需分配说明卡。
    t.content.querySelectorAll('.demandtoday182').forEach(el=>el.remove());
    t.content.querySelectorAll('.card').forEach(card=>{
      const bolds=[...card.querySelectorAll('b')].map(x=>(x.textContent||'').trim());
      if(bolds.includes('今日学习流程')||bolds.includes('当前学习时长对应题量'))card.remove();
    });
    t.content.querySelectorAll('.pill,button,span').forEach(el=>{
      if((el.textContent||'').trim()==='按需分配')el.remove();
    });
    return t.innerHTML;
  }catch(e){
    return String(html||'')
      .replace(/<div class="card demandtoday182">[\s\S]*?<\/div>\s*<\/div>/g,'')
      .replace(/<span class="pill blue">按需分配<\/span>/g,'');
  }
}
const todayBase183=today;
today=function(){return cleanToday183(todayBase183())};

const grammarBase183=grammar;
grammar=function(){
  let h=String(grammarBase183()||'');
  h=h.replace(/今日语法供需分配/g,'今日语法训练');
  h=h.replace(/当前分配节点/g,'当前语法');
  h=h.replace(/今日已分配/g,'今日练习');
  h=h.replace(/本节点分配/g,'本节练习');
  h=h.replace(/题库容量只作为库存；今日只解锁当前学习时长需要的题量。[^<]*/g,'完成今天的练习即可。');
  h=h.replace(/只标出今日分配量；其余节点保留为知识索引，不把整库题数暴露为今日任务。/g,'用于快速回看已学语法与今天的重点。');
  h=h.replace(/<span class="pill">今日未分配<\/span>/g,'');
  h=h.replace(/ · 不显示题库总容量/g,'');
  return h;
};


globalThis.__DELF50_STUDENT_UI_V2={appVersion:APP,contentVersion:CONTENT,route:UI_ROUTE};
render();
})();

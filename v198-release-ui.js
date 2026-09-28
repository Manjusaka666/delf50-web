'use strict';
(function(){
  const RELEASE=globalThis.__DELF50_RELEASE||{app:'1.8.18',content:'1.8.8',schema:2};
  const SNAPSHOT_KEY='delf50_safety_snapshot_pre_schema2';

  function audit198(){
    let full=null;
    try{
      if(window.DELF50_FULL_AUDIT&&typeof window.DELF50_FULL_AUDIT.run==='function')full=window.DELF50_FULL_AUDIT.run();
    }catch(e){}
    const source=globalThis.__delfV181&&globalThis.__delfV181.audit||null;
    const slots=full&&full.counts?Object.values(full.counts).reduce((n,x)=>n+Number(x&&x.slots||0),0):Number(source&&source.generated||0);
    const fullIdIssues=full&&Array.isArray(full.unresolved)?full.unresolved.filter(x=>x&&/content-id/i.test(String(x.kind||''))):[];
    const sourceIdIssues=source&&Array.isArray(source.ids)?source.ids:[];
    const duplicateIds=fullIdIssues.length+sourceIdIssues.length;
    return{ok:duplicateIds===0,slots,duplicateIds,fullIdIssues,sourceIdIssues,full,source};
  }

  function snapshot198(){
    try{return localStorage.getItem(SNAPSHOT_KEY)?'已创建':'无需创建'}catch(e){return'不可用'}
  }

  function compatCard198(){
    const a=audit198(),m=S&&S.meta172||{},migrationCount=Array.isArray(m.migrations)?m.migrations.length:0;
    const open=a.duplicateIds;
    return '<div class="card"><h2>兼容与升级保护</h2>'+
      '<div class="grid3">'+
        '<div class="metric"><span>状态 Schema</span><b>'+RELEASE.schema+'</b><span>只做向后兼容迁移</span></div>'+
        '<div class="metric"><span>教学内容版本</span><b>'+RELEASE.content+'</b><span>当前发布内容</span></div>'+
        '<div class="metric"><span>Content ID</span><b>'+(a.ok?'稳定':'需检查')+'</b><span>'+a.slots+' 有效 Content ID · '+open+' 重复</span></div>'+
      '</div>'+
      '<div class="callout '+(a.ok?'good':'warn')+'" style="margin-top:10px">'+
        (a.ok
          ?'当前有效内容分配与最新题库审计一致；新增模块继续使用独立字段和 migration。已有学习计数、文本、错题与录音引用不得减少，已开始或已完成内容继续按 ID 锁定。'
          :'当前有效 Content ID 仍有重复项需要检查；系统不会因此改写已有学习证据。这里仅统计有效 Content ID，不再把题干、正文或旧 Trace ID 重复混入此指标。')+
      '</div>'+
      '<div class="storage">App '+RELEASE.app+' · Content '+RELEASE.content+' · 迁移记录：'+migrationCount+'</div>'+
    '</div>';
  }

  function stripLegacyCompat198(h){
    return String(h||'').replace(/<div class="card"><h2>兼容与升级保护<\/h2>[\s\S]*?<div class="storage">迁移记录：[\s\S]*?<\/div><\/div>/g,'');
  }

  if(typeof progressPage==='function'){
    const progressBase198=progressPage;
    progressPage=function(){
      const h=stripLegacyCompat198(progressBase198());
      return h+compatCard198();
    };
  }

  if(typeof today==='function'){
    const todayBase198=today;
    today=function(){
      return String(todayBase198()).replace(/Schema\s+\d+\s+·\s+Content\s+[0-9.]+/g,'Schema '+RELEASE.schema+' · Content '+RELEASE.content);
    };
  }

  if(typeof S!=='undefined'){
    S.version=RELEASE.app;
    if(S.meta172){
      S.meta172.appVersion=RELEASE.app;
      S.meta172.contentVersion=RELEASE.content;
      S.meta172.releaseUi='compat-ui-unified-v1';
    }
  }

  if(window.DELF50_ARCH){
    window.DELF50_ARCH.version=RELEASE.app;
    window.DELF50_ARCH.schemaVersion=RELEASE.schema;
    window.DELF50_ARCH.contentVersion=RELEASE.content;
  }

  globalThis.__DELF50_RELEASE_UI={version:RELEASE.app,contentVersion:RELEASE.content,audit:audit198};
  if(typeof render==='function')render();
})();

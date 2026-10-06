'use strict';
/* DELF50 · v198: the diagnostics API (window.DELF50_ARCH) reports the running release. */
(function(){
  const RELEASE=globalThis.__DELF50_RELEASE;
  if(window.DELF50_ARCH){
    window.DELF50_ARCH.version=RELEASE.app;
    window.DELF50_ARCH.schemaVersion=RELEASE.schema;
    window.DELF50_ARCH.contentVersion=RELEASE.content;
  }
})();

'use strict';
/* DELF50 · v203-release-state
 *
 * The last layer, and the one place the learner's state is stamped with the
 * release: no earlier layer writes a version, so the stored state names the
 * release that actually ran. It also removes what older releases stored but
 * nothing reads (layer labels, audit results, boot-time stamps); left in place,
 * a stamp renewed on every page load turned every load into a write.
 */
(function(){
if (typeof S === 'undefined') return;
var R = globalThis.__DELF50_RELEASE;
var STALE = ['contentRouting', 'contentRoutingUpdatedAt', 'demandAllocation', 'demandAllocationUpdatedAt', 'fullQuestionAudit',
  'grammarHistory', 'grammarIntegrity', 'grammarUI', 'grammarUniqueAudit', 'highIntensityCapacity', 'historyPolicy', 'inputQuality',
  'lifecycle', 'listeningAlignment', 'noRepeatAudit', 'outputAlignment', 'readingAlignment', 'releaseUi', 'replacementRouting',
  'studentContent', 'studentInputMetadata', 'studentUi', 'volumeProfile'];
['contentAudit186', 'contentAudit187', 'contentAudit188', 'contentRouting181', 'repairs176'].forEach(function(k){ delete S[k]; });
S.version = R.app;
if (S.meta172){
  S.meta172.appVersion = R.app;
  S.meta172.contentVersion = R.content;
  STALE.forEach(function(k){ delete S.meta172[k]; });
}
var plans = S.grammarDemand182;
if (plans) for (var k in plans) if (plans[k]) delete plans[k].updatedAt;
save();   /* reaches the server only when something above actually changed */
if (typeof render === 'function') render();
})();

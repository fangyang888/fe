import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectCandidatePool,summarizeCandidatePool} from '../lib/candidate-diagnostics.js';
import {createVectorAnalysis} from '../lib/vector-analysis.js';
test('separates duplicate forecasts, shared numbers, selector misses and complete blind spots',()=>{
  const vector=Array.from({length:32},(_,i)=>i+1),other=[...vector.slice(0,31),33];
  const predictions={vector,duplicate:[...vector].reverse(),other};
  const recovery=inspectCandidatePool(predictions,33);
  assert.equal(recovery.uniqueForecasts,2);assert.equal(recovery.commonNumberCount,31);assert.equal(recovery.unionNumberCount,33);
  assert.equal(recovery.referenceHit,false);assert.equal(recovery.anyCandidateHit,true);assert.deepEqual(recovery.hitCandidates,['other']);
  const blind=inspectCandidatePool(predictions,49);assert.equal(blind.anyCandidateHit,false);
  const summary=summarizeCandidatePool([{year:2026,No:1,special:33,pool:recovery},{year:2026,No:2,special:49,pool:blind}]);
  assert.equal(summary.hindsightAnyCandidateHits,1);assert.equal(summary.referenceMissButAnotherCandidateHit,1);assert.equal(summary.allCandidatesMissed,1);
  assert.deepEqual(summary.blindSpots,[{year:2026,No:2,special:49}]);
  assert.equal(summarizeCandidatePool([]).meanUniqueForecasts,null);
});
test('diagnostic tool excludes warmup and labels hindsight as non-predictive',async()=>{
  const history=Array.from({length:30},(_,i)=>({year:2026,No:i+1,...Object.fromEntries(Array.from({length:7},(_,j)=>[`n${j+1}`,(i+j)%49+1]))}));
  const call=createVectorAnalysis({loadHistory:async()=>history});
  const result=await call('diagnose_candidate_pool',{window:20});
  assert.equal(result.count,0);assert.match(result.warning,/事后/);assert.equal(result.candidateCount,16);
});

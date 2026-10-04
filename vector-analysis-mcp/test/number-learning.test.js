import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FEATURE_NAMES,fitNumberModel,numberFeatures,predictNumbers,runNumberLearning} from '../lib/number-learning.js';
import {createVectorAnalysis} from '../lib/vector-analysis.js';
import engine from '../generated/vector/likely32Lab.js';
function fixture(count) {
  let seed=4147;
  return Array.from({length:count},(_,i)=>{
    const numbers=[];while(numbers.length<7){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed%49+1;if(!numbers.includes(n))numbers.push(n);}
    return {year:2026,No:i+1,...Object.fromEntries(numbers.map((n,j)=>[`n${j+1}`,n]))};
  });
}
test('learns a per-number feature signal, including numbers outside the old 36-number pool',()=>{
  const matrix=new Float64Array(49*FEATURE_NAMES.length);matrix[48*FEATURE_NAMES.length]=1;
  const training=Array.from({length:100},(_,i)=>({year:2026,No:i+1,special:49,features:matrix}));
  const before=Array.from(matrix),result=predictNumbers(matrix,training);
  assert.equal(result.ranking[0].n,49);assert(result.ranking[0].score>1/49);
  assert.equal(new Set(result.picks).size,32);assert(result.picks.includes(49));
  assert(Math.abs(result.ranking.reduce((s,r)=>s+r.score,0)-1)<1e-12);
  assert.deepEqual(Array.from(matrix),before);
  assert.deepEqual(fitNumberModel([{year:2025,No:1,special:1,features:matrix},...training]),fitNumberModel(training));
  assert.equal(predictNumbers(matrix,training.slice(1)).ready,false);
});
test('each forecast uses only earlier labels, and the current ranking equals the next replay forecast',()=>{
  const raw=fixture(225),fullLab=engine.buildLikely32Lab(raw),prefixLab=engine.buildLikely32Lab(raw.slice(0,220));
  const history=engine.parseLabHistory(raw),full=runNumberLearning(history,fullLab),prefix=runNumberLearning(history.slice(0,220),prefixLab);
  const overlap=full.recentRows.filter(r=>r.No<=220);
  assert.deepEqual(overlap,prefix.recentRows.slice(-overlap.length));
  assert.deepEqual(full.recentRows.find(r=>r.No===221).picks,prefix.current.picks);
  assert.equal(full.current.trainingFrom.No,126);assert.equal(full.current.trainingThrough.No,225);
  assert.equal(full.all.numberLearning.count,25);assert.equal(full.all.vector.count,25);
  const changed=raw.slice(0,221).map(r=>r.No===221?{...r,n1:r.n7,n7:r.n1}:r);
  const altered=runNumberLearning(engine.parseLabHistory(changed),engine.buildLikely32Lab(changed));
  assert.deepEqual(altered.recentRows.at(-1).picks,prefix.current.picks);
  assert.equal(altered.recentRows.at(-1).trainingThrough.No,220);
  const context=numberFeatures(history,prefixLab.current);
  const oldChanged=history.map((r,i)=>i<125?{...r,numbers:[...r.numbers].reverse()}:r);
  assert.deepEqual(numberFeatures(oldChanged,prefixLab.current),context);
  for(const row of full.recentRows){assert.equal(new Set(row.picks).size,32);assert(row.picks.every(n=>n>=1&&n<=49));}
});
test('MCP number-learning tools support cutoff, warmup and gains/losses accounting',async()=>{
  const history=fixture(220),call=createVectorAnalysis({loadHistory:async()=>history});
  const prediction=await call('get_number_forecast',{as_of:{year:2026,No:219}});
  assert.equal(prediction.prediction.trainingThrough.No,219);assert.equal(prediction.prediction.ranking.length,49);
  const result=await call('backtest_number_learner',{window:20,include_rows:true,as_of:{year:2026,No:219}});
  const r=result.comparisons;
  assert.equal(r.numberLearning.count,19);assert.equal(r.vector.count,19);
  assert.equal(r.numberLearning.hits-r.vector.hits,r.versus.vector.gains-r.versus.vector.losses);
  const warmup=await call('get_number_forecast',{as_of:{year:2026,No:199}});assert.equal(warmup.prediction.ready,false);
  const empty=await call('get_number_forecast',{as_of:{year:2026,No:90}});assert.equal(empty.prediction,null);
});

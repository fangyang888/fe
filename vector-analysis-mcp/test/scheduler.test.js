import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CANDIDATES,SCHEDULERS,parameterPredictions,runSchedulerLab,selectSchedule} from '../lib/scheduler.js';
import {createVectorAnalysis} from '../lib/vector-analysis.js';
import engine from '../generated/vector/likely32Lab.js';
function fixture(count) {
  let seed=1731;
  return Array.from({length:count},(_,i)=>{
    const numbers=[];while(numbers.length<7){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed%49+1;if(!numbers.includes(n))numbers.push(n);}
    return {year:2026,No:i+1,...Object.fromEntries(numbers.map((n,j)=>[`n${j+1}`,n]))};
  });
}
test('scheduler waits for 100 prior candidate outcomes and reacts only to past evidence',()=>{
  const predictions=Object.fromEntries(CANDIDATES.map(c=>[c.id,Array.from({length:32},(_,i)=>i+1)]));
  predictions.vector=Array.from({length:32},(_,i)=>i+18);
  const records=Array.from({length:100},(_,i)=>({year:2026,No:i+1,state:[0,0],hits:Object.fromEntries(CANDIDATES.map(c=>[c.id,c.id==='vector']))}));
  assert.equal(selectSchedule('rolling100',predictions,[0,0],records.slice(1)).ready,false);
  for(const scheduler of SCHEDULERS){
    const chosen=selectSchedule(scheduler,predictions,[0,0],records);
    assert.equal(new Set(chosen.picks).size,32);assert.equal(chosen.trainingThrough.No,100);
    if(scheduler!=='ensemble100')assert.equal(chosen.selected,'vector');
    else assert.equal(chosen.members.length,2);
  }
  const reversed=records.map(r=>({...r,hits:Object.fromEntries(CANDIDATES.map(c=>[c.id,c.id==='vectorLearn']))}));
  assert.equal(selectSchedule('rolling100',predictions,[0,0],reversed,'vector').selected,'vectorLearn');
});
test('parameter grid reproduces the original learner; schedules have prefix and target-label invariance',()=>{
  const raw=fixture(260),full=engine.buildLikely32Lab(raw),prefix=engine.buildLikely32Lab(raw.slice(0,250));
  const a=runSchedulerLab(prefix),b=runSchedulerLab(full),records=[];
  assert.equal(CANDIDATES.length,16);
  for(const row of full.rows){
    const candidates=parameterPredictions(row,records);
    assert.deepEqual(candidates['learn-100-0.6-4'],row.picks.vectorLearn);
    for(const picks of Object.values(candidates)){assert.equal(new Set(picks).size,32);assert(picks.every(n=>n>=1&&n<=49));}
    records.push({special:row.special,swaps:row.vector.swaps});if(records.length>100)records.shift();
  }
  const overlap=b.recentRows.filter(r=>r.No<=250);
  assert.deepEqual(overlap,a.recentRows.slice(-overlap.length));
  const target=b.recentRows.find(r=>r.No===251);
  for(const name of SCHEDULERS)assert.deepEqual(a.current[name].picks,target.decisions[name].picks);
  const changed=raw.slice(0,251).map(r=>r.No===251?{...r,n1:r.n7,n7:r.n1}:r);
  const targetChanged=runSchedulerLab(engine.buildLikely32Lab(changed)).recentRows.at(-1);
  for(const name of SCHEDULERS){
    assert.deepEqual(targetChanged.decisions[name].picks,target.decisions[name].picks);
    assert.equal(targetChanged.decisions[name].trainingThrough.No,250);
  }
  assert.equal(b.all.rolling100.count,50); // First eligible target is draw 211.
  assert.equal(b.all.vector.count,b.all.rolling100.count);
});
test('MCP scheduling tools expose fixed protocol, cutoff, 32 picks and optional replay rows',async()=>{
  const call=createVectorAnalysis({loadHistory:async()=>fixture(240)});
  const forecast=await call('get_scheduled_forecast',{as_of:{year:2026,No:230},scheduler:'context100'});
  assert.equal(forecast.trainingThrough.No,230);assert.equal(forecast.picks.length,32);assert.equal(forecast.ready,true);
  const report=await call('backtest_scheduler',{window:20,include_rows:true,as_of:{year:2026,No:230}});
  assert.equal(report.rows.length,20);assert.equal(report.candidates.length,16);
  for(const s of Object.values(report.comparisons))assert.equal(s.count,20);
  assert.equal(report.protocol.defaultScheduler,'rolling100');
  await assert.rejects(call('get_scheduled_forecast',{scheduler:'winner-after-seeing-result'}),/不支持/);
});

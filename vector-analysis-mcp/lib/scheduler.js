import {inspectCandidatePool, summarizeCandidatePool} from './candidate-diagnostics.js';
// Fixed experiment protocol. Do not tune this registry against the displayed replay.
export const SCHEDULER_VERSION = 'vector-scheduler-v1';
export const SCHEDULER_PROTOCOL = {
  version: SCHEDULER_VERSION, pickCount: 32, selectionWindow: 100,
  minimumDecisions: 4, switchMargin: 0.02, recentHalfLife: 20, contextBandwidth: 0.15,
  ensembleSize: 3, distinctEnsemblePicks: true, defaultScheduler: 'rolling100',
  warning: '固定候选集的逐期调度回放。原算法已探索过这批历史；不是独立样本外验证，也不是下一期概率。',
};
export const CANDIDATES = [
  ...['vectorLearn','vector','vectorGuard','original'].map(model=>({id:model,kind:'existing',model})),
  ...[50,100].flatMap(window=>[0.5,0.6,0.7].flatMap(support=>[2,4].map(maxSwaps=>({
    id:`learn-${window}-${support}-${maxSwaps}`,kind:'learning',window,support,maxSwaps,minimumDecisions:4,
  })))),
];
export const SCHEDULERS = ['rolling100','recent20','context100','ensemble100'];
const issue = r => ({year:r.year,No:r.No});
const stateVector = r => [...r.pools.map(n=>n/49),
  r.vector.neighbors.length ? r.vector.neighbors.reduce((s,n)=>s+n.similarity,0)/r.vector.neighbors.length : 0,
  r.vector.swaps.length/4, r.vector.swaps.reduce((s,n)=>s+n.advantage,0)];

export function parameterPredictions(row, settled) {
  return Object.fromEntries(CANDIDATES.map(candidate=>{
    if(candidate.kind==='existing') return [candidate.id,[...row.picks[candidate.model]]];
    const training=settled.slice(-candidate.window),picks=[...row.picks.original];
    if(training.length===candidate.window) for(let slot=0;slot<candidate.maxSwaps;slot++) {
      const proposal=row.vector.swaps[slot];if(!proposal)continue;
      let gains=0,losses=0;
      for(const record of training){const s=record.swaps[slot];if(s){gains+=Number(record.special===s.to);losses+=Number(record.special===s.from);}}
      if(gains+losses>=candidate.minimumDecisions&&(gains+1)/(gains+losses+2)>=candidate.support) {
        picks[picks.indexOf(proposal.from)]=proposal.to;
      }
    }
    return [candidate.id,picks];
  }));
}

export function selectSchedule(name, predictions, currentState, settled, incumbent='vectorLearn') {
  if(!SCHEDULERS.includes(name))throw new Error('未知调度规则');
  const training=settled.slice(-100),ready=training.length===100;
  if(!ready)return {ready:false,trainingCount:training.length,selected:'vectorLearn',parameters:CANDIDATES[0],picks:[...predictions.vectorLearn],reason:'不足100期有效候选回测，暂用向量历史学习',ranking:[],trainingFrom:training.length?issue(training[0]):null,trainingThrough:training.length?issue(training.at(-1)):null};
  const weights=training.map((record,i)=>name==='recent20'?0.5**((training.length-1-i)/20):name==='context100'?
    Math.exp(-record.state.reduce((s,n,j)=>s+(n-currentState[j])**2,0)/(2*0.15**2)):1);
  const mass=weights.reduce((s,w)=>s+w,0);
  const ranking=CANDIDATES.map((candidate,index)=>({id:candidate.id,parameters:candidate,index,
    score:training.reduce((s,r,i)=>s+weights[i]*Number(r.hits[candidate.id]),0)/mass,
    hits:training.filter(r=>r.hits[candidate.id]).length})).sort((a,b)=>b.score-a.score||a.index-b.index);
  let selected=incumbent,picks,reason,members;
  if(name==='ensemble100') {
    members=[];const seen=new Set();
    for(const candidate of ranking) {
      const signature=[...predictions[candidate.id]].sort((a,b)=>a-b).join(',');
      if(!seen.has(signature)){members.push(candidate.id);seen.add(signature);}
      if(members.length===3)break;
    }
    selected='ensemble';
    picks=Array.from({length:49},(_,i)=>i+1).sort((a,b)=>{
      const vote=n=>members.reduce((s,id)=>s+Number(predictions[id].includes(n)),0);
      return vote(b)-vote(a)||Number(predictions.vectorLearn.includes(b))-Number(predictions.vectorLearn.includes(a))||a-b;
    }).slice(0,32);
    reason='按此前100期排名选择最多三组不同的32码候选等权投票，固定选32码；同票优先历史学习原码，再按号码排序';
  } else {
    const previous=ranking.find(r=>r.id===incumbent);
    if(ranking[0].score>previous.score+SCHEDULER_PROTOCOL.switchMargin)selected=ranking[0].id;
    picks=[...predictions[selected]];
    reason=selected===incumbent?'候选优势未超过2个百分点切换门槛，保持原参数':'仅依据此前100期成绩，切换到超过门槛的候选';
  }
  return {ready,trainingCount:100,trainingFrom:issue(training[0]),trainingThrough:issue(training.at(-1)),
    effectiveSamples:mass*mass/weights.reduce((s,w)=>s+w*w,0),selected,parameters:CANDIDATES.find(c=>c.id===selected)||null,members,picks,reason,ranking};
}

export function runSchedulerLab(lab) {
  const proposals=[],settled=[],rows=[],incumbents=Object.fromEntries(SCHEDULERS.map(name=>[name,'vectorLearn']));
  for(const row of lab.rows) {
    const predictions=parameterPredictions(row,proposals),state=stateVector(row);
    // All scheduling decisions and candidate forecasts are completed before seeing this outcome.
    const decisions=Object.fromEntries(SCHEDULERS.map(name=>[name,selectSchedule(name,predictions,state,settled,incumbents[name])]));
    for(const name of SCHEDULERS)if(name!=='ensemble100')incumbents[name]=decisions[name].selected;
    rows.push({...issue(row),special:row.special,pool:inspectCandidatePool(predictions,row.special),decisions:Object.fromEntries(SCHEDULERS.map(name=>{
      const {ranking,...decision}=decisions[name];return [name,{...decision,hit:decision.picks.includes(row.special)}];
    })),baselines:{vectorLearn:row.hits.vectorLearn,vector:row.hits.vector,original:row.hits.original}});
    // Learn all candidates, including the ones not selected by the scheduler.
    if(row.vectorLearning.ready) {
      settled.push({...issue(row),state,hits:Object.fromEntries(CANDIDATES.map(c=>[c.id,predictions[c.id].includes(row.special)]))});
      if(settled.length>100)settled.shift();
    }
    proposals.push({...issue(row),special:row.special,swaps:row.vector.swaps});if(proposals.length>100)proposals.shift();
  }
  const predictions=parameterPredictions(lab.current,proposals),state=stateVector(lab.current);
  const current=Object.fromEntries(SCHEDULERS.map(name=>[name,selectSchedule(name,predictions,state,settled,incumbents[name])]));
  const summarize=sample=>Object.fromEntries([...SCHEDULERS,'vectorLearn','vector','original'].map(name=>{
    // Every method is evaluated on identical eligible target periods.
    const eligible=sample.filter(r=>r.decisions.rolling100.ready);
    const hits=eligible.filter(r=>SCHEDULERS.includes(name)?r.decisions[name].hit:r.baselines[name]).length;
    return [name,{count:eligible.length,hits,rate:eligible.length?hits/eligible.length:null,
      gains:eligible.filter(r=>(SCHEDULERS.includes(name)?r.decisions[name].hit:r.baselines[name])&&!r.baselines.vectorLearn).length,
      losses:eligible.filter(r=>!(SCHEDULERS.includes(name)?r.decisions[name].hit:r.baselines[name])&&r.baselines.vectorLearn).length}];
  }));
  return {protocol:SCHEDULER_PROTOCOL,candidates:CANDIDATES,current,
    windows:Object.fromEntries([20,50,100].map(w=>[w,summarize(rows.slice(-w))])),all:summarize(rows),
    earlier:summarize(rows.slice(0,-100)),recentRows:rows.slice(-100),
    diagnostics:Object.fromEntries([20,50,100].map(w=>[w,summarizeCandidatePool(rows.slice(-w).filter(r=>r.decisions.rolling100.ready))]))};
}

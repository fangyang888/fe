// One fixed model, defined before looking at its replay. No grid search or post-hoc tuning.
export const NUMBER_PROTOCOL = {
  version:'number-softmax100-v1', pickCount:32, featureWindow:100, trainingWindow:100,
  epochs:12, learningRate:1, l2:0.02, initialization:'zero',
  objective:'49-way softmax cross-entropy; one special-number label per draw',
  warmup:'100 draws to form features, then 100 settled feature/label examples; first evaluated target is draw 201',
  scope:'Fit weights from only the previous 100 settled examples. Each example uses data available before its own draw. Existing vector features may summarize earlier history.',
  caution:'Softmax scores are uncalibrated model scores, not verified next-draw probabilities. This historical dataset has already been explored.',
};
export const FEATURE_NAMES = ['七码频次5期','七码频次20期','七码频次100期','特别码频次20期','特别码频次100期',
  '七码遗漏','特别码遗漏','上期七码出现','上期特别码','七码频次变化','特别码频次变化',
  '向量近邻特别码支持','100期近邻评分','原规则入选','原向量入选','历史学习入选'];
const D=FEATURE_NAMES.length,N=49;
const issue=r=>({year:r.year,No:r.No});
const scaled=(value,cap)=>Math.min(cap,Math.max(0,value))/cap;
const clamp=value=>Math.max(-1,Math.min(1,value));

export function numberFeatures(history, reference) {
  const past=history.slice(-100),all=Object.fromEntries([5,20,100].map(w=>[w,new Float64Array(N)]));
  const special=Object.fromEntries([20,100].map(w=>[w,new Float64Array(N)]));
  const miss=new Float64Array(N).fill(past.length),specialMiss=new Float64Array(N).fill(past.length);
  for(let i=0;i<past.length;i++) {
    const lag=past.length-1-i,row=past[i];
    for(const n of row.numbers) {
      miss[n-1]=lag;
      for(const w of [5,20,100])if(lag<w)all[w][n-1]++;
    }
    specialMiss[row.numbers[6]-1]=lag;
    for(const w of [20,100])if(lag<w)special[w][row.numbers[6]-1]++;
  }
  const support=new Float64Array(N);
  let mass=0;
  for(const n of reference.vector.neighbors){support[n.special-1]+=n.weight;mass+=n.weight;}
  const rolling=new Map(reference.rolling100.ranking.map(r=>[r.n,r.score]));
  const memberships=['original','vector','vectorLearn'].map(m=>new Set(reference.picks[m]));
  const matrix=new Float64Array(N*D);
  for(let i=0;i<N;i++) {
    const af=w=>all[w][i]*49/(Math.min(past.length,w)*7),sf=w=>special[w][i]*49/Math.min(past.length,w);
    const values=[scaled(af(5),3),scaled(af(20),3),scaled(af(100),3),scaled(sf(20),5),scaled(sf(100),5),
      Math.log1p(Math.min(miss[i],40))/Math.log(41),Math.log1p(specialMiss[i])/Math.log(101),
      Number(past.at(-1).numbers.includes(i+1)),Number(past.at(-1).numbers[6]===i+1),
      clamp((af(5)-af(20))/3),clamp((sf(20)-sf(100))/5),scaled(mass?support[i]*49/mass:0,5),
      scaled((rolling.get(i+1)||0)*49,5),...memberships.map(set=>Number(set.has(i+1)))];
    matrix.set(values,i*D);
  }
  // Center within each known 49-number state, without fitting on future periods.
  for(let j=0;j<D;j++) {
    let mean=0;for(let i=0;i<N;i++)mean+=matrix[i*D+j];mean/=N;
    for(let i=0;i<N;i++)matrix[i*D+j]-=mean;
  }
  return matrix;
}

function probabilities(matrix,weights,scores=new Float64Array(N)) {
  let maximum=-Infinity;
  for(let i=0;i<N;i++) {
    let value=0;for(let j=0;j<D;j++)value+=matrix[i*D+j]*weights[j];
    scores[i]=value;if(value>maximum)maximum=value;
  }
  let mass=0;for(let i=0;i<N;i++){scores[i]=Math.exp(scores[i]-maximum);mass+=scores[i];}
  for(let i=0;i<N;i++)scores[i]/=mass;
  return scores;
}

export function fitNumberModel(examples) {
  const training=examples.slice(-NUMBER_PROTOCOL.trainingWindow),weights=new Float64Array(D);
  if(!training.length)return weights;
  const positive=new Float64Array(D),scores=new Float64Array(N),gradient=new Float64Array(D);
  for(const e of training)for(let j=0;j<D;j++)positive[j]+=e.features[(e.special-1)*D+j];
  for(let epoch=0;epoch<NUMBER_PROTOCOL.epochs;epoch++) {
    gradient.fill(0);
    for(const e of training) {
      probabilities(e.features,weights,scores);
      for(let i=0;i<N;i++)for(let j=0;j<D;j++)gradient[j]+=scores[i]*e.features[i*D+j];
    }
    for(let j=0;j<D;j++)weights[j]-=NUMBER_PROTOCOL.learningRate*((gradient[j]-positive[j])/training.length+NUMBER_PROTOCOL.l2*weights[j]);
  }
  return weights;
}

export function predictNumbers(features,examples) {
  const training=examples.slice(-100),weights=fitNumberModel(training),scores=probabilities(features,weights);
  const ranking=Array.from(scores,(score,i)=>({n:i+1,score})).sort((a,b)=>b.score-a.score||a.n-b.n);
  return {ready:training.length===100,trainingCount:training.length,trainingFrom:training.length?issue(training[0]):null,
    trainingThrough:training.length?issue(training.at(-1)):null,picks:ranking.slice(0,32).map(r=>r.n),ranking,
    weights:FEATURE_NAMES.map((feature,i)=>({feature,value:weights[i]}))};
}

export function runNumberLearning(history,lab) {
  const examples=[],rows=[];
  const referenceRows=new Map(lab.rows.map(r=>[`${r.year}-${r.No}`,r]));
  for(let index=100;index<history.length;index++) {
    const actual=history[index],reference=referenceRows.get(`${actual.year}-${actual.No}`);
    const features=numberFeatures(history.slice(index-100,index),reference);
    // Predict and rank all 49 BEFORE reading the target special number.
    const prediction=predictNumbers(features,examples);
    const special=actual.numbers[6],hit=prediction.picks.includes(special);
    const union=new Set([...reference.picks.original,...reference.picks.vector]);
    rows.push({...issue(actual),special,ready:prediction.ready,trainingFrom:prediction.trainingFrom,trainingThrough:prediction.trainingThrough,
      picks:prediction.picks,hit,specialRank:prediction.ranking.findIndex(r=>r.n===special)+1,
      outsideOriginal:prediction.picks.filter(n=>!reference.picks.original.includes(n)).length,
      outsidePreviousCandidatePool:prediction.picks.filter(n=>!union.has(n)).length,
      priorPoolMiss:!union.has(special),baselines:{vector:reference.hits.vector,vectorLearn:reference.hits.vectorLearn,original:reference.hits.original}});
    examples.push({...issue(actual),features,special});if(examples.length>100)examples.shift();
  }
  const current=history.length>=100?predictNumbers(numberFeatures(history.slice(-100),lab.current),examples):null;
  const summarize=sample=>{
    const eligible=sample.filter(r=>r.ready),count=eligible.length;
    const model=hits=>({count,hits,rate:count?hits/count:null});
    return {numberLearning:model(eligible.filter(r=>r.hit).length),
      ...Object.fromEntries(['vector','vectorLearn','original'].map(name=>[name,model(eligible.filter(r=>r.baselines[name]).length)])),
      versus:Object.fromEntries(['vector','vectorLearn'].map(name=>[name,{
        gains:eligible.filter(r=>r.hit&&!r.baselines[name]).length,losses:eligible.filter(r=>!r.hit&&r.baselines[name]).length,
      }])),previousPoolMisses:eligible.filter(r=>r.priorPoolMiss).length,
      recoveredPoolMisses:eligible.filter(r=>r.priorPoolMiss&&r.hit).length,
      meanOutsideOriginal:count?eligible.reduce((s,r)=>s+r.outsideOriginal,0)/count:null,
      meanOutsidePreviousPool:count?eligible.reduce((s,r)=>s+r.outsidePreviousCandidatePool,0)/count:null};
  };
  return {protocol:NUMBER_PROTOCOL,features:FEATURE_NAMES,current,
    windows:Object.fromEntries([20,50,100].map(w=>[w,summarize(rows.slice(-w))])),
    all:summarize(rows),earlier:summarize(rows.slice(0,-100)),recentRows:rows.slice(-100)};
}

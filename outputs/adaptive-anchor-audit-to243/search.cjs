const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'server/node_modules/ts-node')).register({transpileOnly:true,project:path.join(root,'server/tsconfig.json')});
const {AdaptiveAnchorSuiteService}=require(path.join(root,'server/src/predictor/adaptive-anchor-suite.service.ts'));
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'history.json')));
assert.equal(raw.at(-1).year,2026);assert.equal(raw.at(-1).No,243);
const h=raw.map(r=>({...r,numbers:Array.from({length:7},(_,i)=>Number(r[`n${i+1}`]))}));
const N=h.length,cut=h.findIndex(r=>r.year===2026&&r.No===198)+1;
const seen=new Set();h.forEach((r,i)=>{const k=`${r.year}-${r.No}`;assert(!seen.has(k));seen.add(k);assert.equal(new Set(r.numbers).size,7);assert(r.numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=49));if(i&&r.year===h[i-1].year)assert.equal(r.No,h[i-1].No+1);});
const ranges={train:[cut-200,cut],observation:[cut,N],since212:[cut+13,N],last10:[N-10,N],last20:[N-20,N],last50:[N-50,N],last100:[N-100,N],last200:[N-200,N]};
const configs=[];
for(const lag of [1,2,3,5,7,10,14,20,30,50,100,150,176,186,191,200])for(let position=1;position<=7;position++)for(const a of [1,2,3,5,7,11,21,35,48])for(const b of [0,6,7,15])configs.push({key:`L${lag}-P${position}-A${a}-B${b}`,lag,position,a,b});
const protocol={scope:'Data ends at 2026-243 inclusive; no later rows loaded',configs,linearCount:configs.length,selection:'minimum failures in 200 periods ending 2026-198; ties use config order',onlineWindows:[20,50,100,200],onlineMethods:['leader','weighted-vote-0.25','weighted-vote-1'],warning:'All observations already historically available. New rules are exploratory, not unseen validation. Any perfect rule found by ranking the evaluation period is post-hoc selection, not evidence of 100% future accuracy.'};
fs.writeFileSync(path.join(__dirname,'protocol.json'),JSON.stringify(protocol,null,2));
const hit=h.map(r=>{const a=new Uint8Array(50);r.numbers.forEach(n=>a[n]=1);return a;});
const wrap=x=>((x-1)%49+49)%49+1;
function summary(p,[s,e]){let success=0,failures=[];for(let t=s;t<e;t++){assert(p[t]>=1&&p[t]<=49);if(!hit[t][p[t]])success++;else failures.push({year:h[t].year,No:h[t].No,predicted:p[t],actual:h[t].numbers});}return{success,count:e-s,rate:success/(e-s),failures};}
function summarize(key,p){return{key,...Object.fromEntries(Object.entries(ranges).map(([k,v])=>[k,summary(p,v)]))};}
function bank(data){return configs.map(c=>{const p=new Uint8Array(data.length+1);for(let t=200;t<=data.length;t++)p[t]=wrap(c.a*data[t-c.lag].numbers[c.position-1]+c.b);return p;});}
const preds=bank(h);
const results=configs.map((c,i)=>summarize(c.key,preds[i]));
const chosenIndex=results.reduce((b,r,i)=>r.train.success>results[b].train.success?i:b,0);
const prefixes=preds.map(p=>{const a=new Uint16Array(N+1);for(let t=200;t<N;t++)a[t+1]=a[t]+hit[t][p[t]];return a;});
function online(end){
  const out={};
  for(const w of protocol.onlineWindows){
    const leader=new Uint8Array(end+1),vote025=new Uint8Array(end+1),vote1=new Uint8Array(end+1);
    for(let t=400;t<=end;t++){
      let best=0,bestLoss=Infinity;const votes025=new Float64Array(50),votes1=new Float64Array(50);
      for(let j=0;j<configs.length;j++){const loss=prefixes[j][t]-prefixes[j][t-w];if(loss<bestLoss){best=j;bestLoss=loss;}votes025[preds[j][t]]+=Math.exp(-0.25*loss);votes1[preds[j][t]]+=Math.exp(-loss);}
      const max=v=>{let n=1;for(let k=2;k<=49;k++)if(v[k]>v[n])n=k;return n;};
      leader[t]=preds[best][t];vote025[t]=max(votes025);vote1[t]=max(votes1);
    }
    out[`leader-${w}`]=leader;out[`vote-${w}-0.25`]=vote025;out[`vote-${w}-1`]=vote1;
  }
  return out;
}
const onlinePred=online(N),onlineResults=Object.entries(onlinePred).map(([k,p])=>summarize(k,p));
const chosenOnline=onlineResults.reduce((b,r)=>r.train.success>b.train.success?r:b,onlineResults[0]).key;
const service=new AdaptiveAnchorSuiteService({findAll:async()=>raw});
const norm=service.normalizeRows(raw),defs=service.baseDefinitions(),success=service.buildBaseSuccess(norm,defs);
const baseRows={K:service.buildKRows(norm,defs[0]),R50:service.buildR50Rows(norm,defs,success).rows,'R20/50':service.buildR2050Rows(norm,defs,success).rows,M10:service.buildM10Rows(norm,defs,success).rows,A100:service.buildA100Rows(norm,defs,success).rows};
const index=new Map(h.map((r,i)=>[`${r.year}-${r.No}`,i]));
const basePred=Object.fromEntries(Object.entries(baseRows).map(([k,rows])=>{const p=new Uint8Array(N);for(const r of rows)p[index.get(`${r.year}-${r.No}`)]=r.predictedNumber;return[k,p];}));
const baseResults=Object.entries(basePred).map(([k,p])=>summarize(k,p));
// Keep every tested rule in a compact ledger, including failures, avoiding ranking-only reporting.
const compact=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k==='key'?v:{success:v.success,count:v.count}]));
const report={count:N,latest:'2026-243',historySha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'history.json'))).digest('hex'),protocol:{...protocol,configs:undefined},chosenLinear:results[chosenIndex],chosenOnline:onlineResults.find(r=>r.key===chosenOnline),existing:baseResults,online:onlineResults,perfectCounts:Object.fromEntries(Object.keys(ranges).map(k=>[k,results.filter(r=>r[k].success===r[k].count).length])),perfectSince212:results.filter(r=>r.since212.success===r.since212.count).map(compact),perfectObservation:results.filter(r=>r.observation.success===r.observation.count).map(compact),allLinear:results.map(compact)};
// Prefix invariance: for every bank formula, regenerate from truncated data.
for(const t of [cut,cut+13,N-10,N-1]){const partial=bank(h.slice(0,t));for(let j=0;j<configs.length;j++)assert.equal(partial[j][t],preds[j][t]);}
// Independently recalculate online choices from only prior draws at selected boundaries.
for(const t of [cut,cut+13,N-10,N-1])for(const w of protocol.onlineWindows){const losses=configs.map((_,j)=>{let loss=0;for(let i=t-w;i<t;i++)loss+=hit[i][preds[j][i]];return loss;});const best=losses.reduce((b,l,j)=>l<losses[b]?j:b,0);assert.equal(onlinePred[`leader-${w}`][t],preds[best][t]);for(const eta of [0.25,1]){const v=Array(50).fill(0);losses.forEach((l,j)=>v[preds[j][t]]+=Math.exp(-eta*l));let pick=1;for(let n=2;n<=49;n++)if(v[n]>v[pick])pick=n;assert.equal(onlinePred[`vote-${w}-${eta}`][t],pick);}}
// The new grid includes exact K; independently generated K must equal the actual service.
const kIndex=configs.findIndex(c=>c.lag===186&&c.position===1&&c.a===21&&c.b===6);for(let t=400;t<N;t++)assert.equal(preds[kIndex][t],basePred.K[t]);
report.verification={bankPrefixChecks:4*configs.length,onlineIndependentChecks:4*12,exactKParityPeriods:N-400,allPassed:true};
fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2));
const chosen={...basePred,'selected-linear':preds[chosenIndex],...onlinePred};
// Include all post-hoc 32/32 formulas as audit examples, explicitly named.
for(const r of results.filter(r=>r.since212.success===r.since212.count))chosen[`posthoc-${r.key}`]=preds[configs.findIndex(c=>c.key===r.key)];
const csv=['year,period,algorithm,predicted,actual,success'];for(const[k,p]of Object.entries(chosen))for(let t=400;t<N;t++)csv.push([h[t].year,h[t].No,k,p[t],h[t].numbers.join('|'),1-hit[t][p[t]]].join(','));
fs.writeFileSync(path.join(__dirname,'predictions.csv'),csv.join('\n'));
console.log(JSON.stringify({selected:compact(report.chosenLinear),online:compact(report.chosenOnline),existing:report.existing.map(compact),perfectCounts:report.perfectCounts,perfectObservation:report.perfectObservation,perfectSince212:report.perfectSince212,verification:report.verification},null,2));

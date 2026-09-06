// Read-only historical experiment. No database writes or product changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'server/node_modules/ts-node')).register({ transpileOnly: true, project: path.join(root, 'server/tsconfig.json') });
const { AdaptiveAnchorSuiteService } = require(path.join(root, 'server/src/predictor/adaptive-anchor-suite.service.ts'));
const start = 291; // All five existing algorithms have predictions from this index.
const windows = [10, 20, 50, 100, 200];
const configs = [];
for (const window of [10, 20, 30, 50, 100, 200]) configs.push({ key: `anchor-loss-${window}`, family: 'anchor', type: 'loss', window, weight: 0 });
for (const window of [10, 20, 50, 100]) for (const riskWindow of [50, 100]) for (const weight of [0.25, 0.75, 1.5]) configs.push({key: `anchor-risk-${window}-${riskWindow}-${weight}`, family: 'anchor', type: 'loss', window, riskWindow, weight});
for (const window of [20, 50, 100, 200]) {
  configs.push({key: `cold-${window}`, family: 'non-anchor', type: 'frequency', window, direction: 1});
  configs.push({key: `hot-${window}`, family: 'non-anchor', type: 'frequency', window, direction: -1});
  configs.push({key: `ewma-${window}`, family: 'non-anchor', type: 'ewma', window});
}
configs.push({key:'longest-absence',family:'non-anchor',type:'gap',direction:-1}, {key:'most-recent',family:'non-anchor',type:'gap',direction:1});
configs.push({key:'markov-shrunk',family:'non-anchor',type:'markov'}, {key:'gap-hazard-pooled',family:'non-anchor',type:'hazard'});
// Protocol fixed before inspecting candidate scores: select by failures in the
// 200 draws ending 2026-198; ties use the configuration order above. Never tune on test.
const protocol = { candidateCount: configs.length, configs, training: 'last 200 draws through 2026-198', test: '2026-199 onwards', primaryComparison: '2026-212 onwards', tie: 'configuration order', criterion: 'single excluded number absent from all seven', disclaimer: 'Retrospective temporal validation, not a previously unseen or prospectively registered test.' };
fs.writeFileSync(path.join(__dirname,'protocol.json'), JSON.stringify(protocol,null,2));
const wrap = x => ((x-1)%49+49)%49+1;
function candidates(raw) {
  const draws = raw.map(r=>Array.from({length:7},(_,i)=>Number(r[`n${i+1}`])));
  const N = draws.length;
  const predictions = Object.fromEntries(configs.map(c=>[c.key,Array(N+1).fill(null)]));
  const occurrence = Array.from({length:N+1},()=>Array(50).fill(0));
  const failures = Array.from({length:N+1},()=>[0,0,0]);
  const last = Array(50).fill(-1);
  const ewmas = Object.fromEntries([20,50,100,200].map(w=>[w,Array(50).fill(1/7)]));
  const transition = Array.from({length:50},()=>[[0,0],[0,0]]);
  const hazard = Array.from({length:21},()=>[0,0]);
  let prev = new Set();
  for(let t=0;t<=N;t++) {
    const bases = t>=191 ? [wrap(21*draws[t-186][0]+6),wrap(2*draws[t-191][1]**2-4*draws[t-191][1]+7),wrap(-21*draws[t-176][2]**3-20*draws[t-176][2]**2-3*draws[t-176][2]-15)] : null;
    const count=(n,w)=>occurrence[t][n]-occurrence[Math.max(0,t-w)][n];
    if(t>=start) for(const c of configs) {
      let numbers = c.type==='loss' ? bases : Array.from({length:49},(_,i)=>i+1);
      let scores = numbers.map((n,i)=> {
        if(c.type==='loss') return failures[t][i]-failures[t-c.window][i]+c.weight*count(n,c.riskWindow||1);
        if(c.type==='frequency') return c.direction*count(n,c.window);
        if(c.type==='ewma') return ewmas[c.window][n];
        if(c.type==='gap') return c.direction*(t-1-last[n]);
        if(c.type==='markov') { const [total,hits]=transition[n][prev.has(n)?1:0]; return (hits+20/7)/(total+20); }
        const [total,hits]=hazard[Math.min(20,t-1-last[n])]; return (hits+100/7)/(total+100);
      });
      const best=scores.reduce((b,s,i)=>s<scores[b]?i:b,0);
      predictions[c.key][t]=numbers[best];
    }
    if(t===N) break;
    const actual = new Set(draws[t]);
    occurrence[t+1]=occurrence[t].slice();
    failures[t+1]=failures[t].slice();
    if(bases) bases.forEach((n,i)=>failures[t+1][i]+=Number(actual.has(n)));
    for(let n=1;n<=49;n++) {
      const hit=Number(actual.has(n));
      occurrence[t+1][n]+=hit;
      for(const w of [20,50,100,200]) {const alpha=1-Math.exp(-Math.log(2)/w);ewmas[w][n]=(1-alpha)*ewmas[w][n]+alpha*hit;}
      if(t>0) {const a=transition[n][prev.has(n)?1:0];a[0]++;a[1]+=hit;}
      const h=hazard[Math.min(20,t-1-last[n])];h[0]++;h[1]+=hit;
      if(hit)last[n]=t;
    }
    prev=actual;
  }
  return predictions;
}
function existing(raw) {
  const service=new AdaptiveAnchorSuiteService({findAll:async()=>raw});
  const h=service.normalizeRows(raw),defs=service.baseDefinitions(),success=service.buildBaseSuccess(h,defs);
  const out={K:{rows:service.buildKRows(h,defs[0]),next:service.makeKPrediction(h,defs[0])},R50:service.buildR50Rows(h,defs,success),'R20/50':service.buildR2050Rows(h,defs,success),M10:service.buildM10Rows(h,defs,success),A100:service.buildA100Rows(h,defs,success)};
  const index=new Map(h.map((r,i)=>[`${r.year}-${r.No}`,i]));
  return Object.fromEntries(Object.entries(out).map(([k,v])=>{const p=Array(h.length+1).fill(null);for(const r of v.rows)p[index.get(`${r.year}-${r.No}`)]=r.predictedNumber;p[h.length]=v.next.number;return[k,p];}));
}
function stats(raw,p,indices) {
  assert(indices.every(i=>Number.isInteger(p[i])&&p[i]>=1&&p[i]<=49));
  let failure=0,specialFailure=0,run=0,maxFailureRun=0;
  for(const i of indices){const ns=Array.from({length:7},(_,j)=>Number(raw[i][`n${j+1}`]));const hit=ns.includes(p[i]);failure+=Number(hit);specialFailure+=Number(ns[6]===p[i]);run=hit?run+1:0;maxFailureRun=Math.max(maxFailureRun,run);}
  const count=indices.length,success=count-failure,rate=success/count,z=1.959963984540054,den=1+z*z/count,mid=(rate+z*z/(2*count))/den,half=z*Math.sqrt(rate*(1-rate)/count+z*z/(4*count*count))/den;
  return {count,success,failure,rate,specialSuccess:count-specialFailure,maxFailureRun,ci95:[mid-half,mid+half]};
}
function binomialUpper(k,n,p) {let sum=0;for(let x=k;x<=n;x++){let log=0;for(let j=1;j<=x;j++)log+=Math.log((n-j+1)/j);sum+=Math.exp(log+x*Math.log(p)+(n-x)*Math.log(1-p));}return Math.min(1,sum);}
function paired(raw,a,b,ids){let wins=0,losses=0;for(const i of ids){const ns=Array.from({length:7},(_,j)=>Number(raw[i][`n${j+1}`]));const sa=!ns.includes(a[i]),sb=!ns.includes(b[i]);wins+=Number(sa&&!sb);losses+=Number(!sa&&sb);}return{wins,losses,oneSidedExactP:binomialUpper(wins,wins+losses,0.5)};}
async function run(name,file){
  const raw=JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));
  const seen=new Set();let gaps=[];
  raw.forEach((r,i)=>{const k=`${r.year}-${r.No}`;assert(!seen.has(k),'Duplicate period');seen.add(k);const ns=Array.from({length:7},(_,j)=>Number(r[`n${j+1}`]));assert(ns.every(n=>Number.isInteger(n)&&n>=1&&n<=49)&&new Set(ns).size===7);if(i&&r.year===raw[i-1].year&&r.No!==raw[i-1].No+1)gaps.push([r.year,raw[i-1].No,r.No]);});
  const cutoff=raw.findIndex(r=>r.year===2026&&r.No===198)+1;
  const train=Array.from({length:200},(_,i)=>cutoff-200+i);
  const test=raw.flatMap((r,i)=>r.year===2026&&r.No>=199?[i]:[]);
  const forward=raw.flatMap((r,i)=>r.year===2026&&r.No>=212?[i]:[]);
  const cs=candidates(raw),bs=existing(raw),all={...bs,...cs,'fixed-01':Array(raw.length+1).fill(1)};
  const ranked=configs.map(c=>({key:c.key,family:c.family,train:stats(raw,cs[c.key],train)})).sort((a,b)=>a.train.failure-b.train.failure);
  const chosen=ranked[0].key,chosenIndependent=ranked.find(c=>c.family==='non-anchor').key;
  const report={name,source:file,count:raw.length,latest:{year:raw.at(-1).year,No:raw.at(-1).No},sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex'),gaps,protocol,chosen,chosenIndependent,results:[]};
  for(const [key,p]of Object.entries(all))report.results.push({key,train:stats(raw,p,train),test:stats(raw,p,test),forward:stats(raw,p,forward),rolling:Object.fromEntries(windows.map(w=>[w,stats(raw,p,Array.from({length:w},(_,i)=>raw.length-w+i))])),next:p[raw.length]});
  report.comparisons=Object.fromEntries([chosen,chosenIndependent].map(k=>[k,Object.fromEntries(Object.entries(bs).map(([b,p])=>[b,paired(raw,all[k],p,forward)]))]));
  report.randomBaseline={probability:42/49,selectedP:binomialUpper(stats(raw,all[chosen],forward).success,forward.length,42/49)};
  // Verify suffix removal cannot change the prediction at the boundary (all candidates and five original algorithms).
  const prefixChecks=[cutoff-100,cutoff,cutoff+13,raw.length-10,raw.length-1];
  for(const t of prefixChecks){const prefix=raw.slice(0,t),pc=candidates(prefix),pb=existing(prefix);for(const[k,p]of Object.entries({...pc,...pb}))assert.equal(p[t],all[k][t],`${k} prefix mismatch at ${t}`);}
  // Direct original endpoint summaries must equal our statistics, without reimplementing the original algorithms.
  const service=new AdaptiveAnchorSuiteService({findAll:async()=>raw});const api=await service.getPrediction();
  for(const a of api.algorithms){const item=report.results.find(x=>x.key===a.code);assert.equal(item.forward.success,a.forwardValidation.successCount);for(const w of windows)assert.equal(item.rolling[w].success,a.rollingBacktests[`backtest${w}`].successCount);}
  report.verification={prefixChecks,allCandidatesAndOriginalsPassed:true,originalServiceSummaryParity:true};
  fs.writeFileSync(path.join(__dirname,`results-${name}.json`),JSON.stringify(report,null,2));
  const csv=['year,period,phase,algorithm,predicted,actual,success'];
  for(const [k,p]of Object.entries(all))for(let i=start;i<raw.length;i++){const r=raw[i],ns=Array.from({length:7},(_,j)=>Number(r[`n${j+1}`]));csv.push([r.year,r.No,i<cutoff?'research':r.No<212?'observation':'retrospective-forward',k,p[i],ns.join('|'),Number(!ns.includes(p[i]))].join(','));}
  fs.writeFileSync(path.join(__dirname,`predictions-${name}.csv`),csv.join('\n'));
  console.log(JSON.stringify({name,chosen,chosenIndependent,results:report.results.filter(r=>Object.keys(bs).includes(r.key)||[chosen,chosenIndependent,'fixed-01'].includes(r.key)).map(r=>({key:r.key,train:r.train,test:r.test,forward:r.forward,last200:r.rolling[200]})),comparisons:report.comparisons,randomBaseline:report.randomBaseline},null,2));
}
(async()=>{await run('local','history.json');await run('complete','history-complete.json');})().catch(e=>{console.error(e);process.exitCode=1;});

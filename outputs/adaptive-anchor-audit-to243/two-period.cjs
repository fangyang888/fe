const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'history.json')));
const h=raw.map(r=>[r.n1,r.n2,r.n3,r.n4,r.n5,r.n6,r.n7]);
const cut=raw.findIndex(r=>r.year===2026&&r.No===198)+1;
const configs=[];
for(const weight of [1,2,0.5])for(const tie of [0,1])for(const appearance of [0,0.5,1])configs.push({key:`select-w${weight}-tie${tie}-appearance${appearance}`,type:'select',weight,tie,appearance});
for(const initial of [0,1])configs.push({key:`switch-after-failure-${initial}`,type:'switch',initial});
for(const window of [50,100,200])for(const strength of [2,10])for(const tie of [0,1])configs.push({key:`state-${window}-${strength}-${tie}`,type:'state',window,strength,tie});
for(const base of [0,1])for(const position of [0,6])for(const transform of ['difference','sum','xor'])for(const coefficient of [-2,-1,1,2])configs.push({key:`adjust-${base}-${position}-${transform}-${coefficient}`,type:'adjust',base,position,transform,coefficient});
for(const position of [0,6])for(const a of [-2,-1,1,2])for(const b of [-2,-1,1,2])configs.push({key:`two-draw-${position}-${a}-${b}`,type:'two-draw',position,a,b});
const protocol={count:configs.length,configs,cutoff:'2026-243',selection:'Most successes in last 200 draws ending 2026-198; ties use config order; no evaluation-period retuning',caveat:'Retrospective exploration on previously seen historical data; the two base formulas were themselves selected using this history. Latest 50 both bases perfect, so any selector between them is trivially perfect there.'};
fs.writeFileSync(path.join(__dirname,'two-period-protocol.json'),JSON.stringify(protocol,null,2));
const wrap=v=>((v-1)%49+49)%49+1;
function compute(data){
  const N=data.length,base=[new Uint8Array(N+1),new Uint8Array(N+1)],loss=[new Uint8Array(N),new Uint8Array(N)];
  for(let t=100;t<=N;t++){base[0][t]=wrap(2*data[t-14][0]+15);base[1][t]=wrap(48*data[t-100][6]);if(t<N)for(let j=0;j<2;j++)loss[j][t]=Number(data[t].includes(base[j][t]));}
  const state=(j,t)=>2*loss[j][t-2]+loss[j][t-1];
  const output={L14:base[0],L100:base[1]};
  for(const c of configs){const p=new Uint8Array(N+1);let previous=c.initial||0;
    for(let t=302;t<=N;t++){
      if(c.type==='adjust'){const x=data[t-1][c.position],y=data[t-2][c.position];const delta=c.transform==='difference'?x-y:c.transform==='sum'?x+y:x^y;p[t]=wrap(base[c.base][t]+c.coefficient*delta);continue;}
      if(c.type==='two-draw'){p[t]=wrap(c.a*data[t-1][c.position]+c.b*data[t-2][c.position]);continue;}
      if(c.type==='switch'){if(loss[previous][t-1])previous=1-previous;p[t]=base[previous][t];continue;}
      const scores=[0,1].map(j=>{
        if(c.type==='select')return c.weight*loss[j][t-1]+loss[j][t-2]+c.appearance*(Number(data[t-1].includes(base[j][t]))+Number(data[t-2].includes(base[j][t])));
        let count=0,hits=0;const current=state(j,t);
        for(let s=Math.max(102,t-c.window);s<t;s++)if(state(j,s)===current){count++;hits+=loss[j][s];}
        return (hits+c.strength/7)/(count+c.strength);
      });
      const j=scores[0]===scores[1]?c.tie:scores[0]<scores[1]?0:1;p[t]=base[j][t];
    }
    output[c.key]=p;
  }
  return output;
}
const predictions=compute(h),N=h.length;
const ranges={train:[cut-200,cut],after198:[cut,N],since212:[cut+13,N],last50:[N-50,N],last100:[N-100,N],last200:[N-200,N],prior150:[N-200,N-50]};
function stats(p,[s,e]){let successes=0;const failures=[];for(let t=s;t<e;t++){assert(p[t]>=1&&p[t]<=49);if(!h[t].includes(p[t]))successes++;else failures.push({year:raw[t].year,No:raw[t].No,predicted:p[t],actual:h[t]});}return{count:e-s,success:successes,failures};}
const all=Object.entries(predictions).map(([key,p])=>({key,...Object.fromEntries(Object.entries(ranges).map(([k,v])=>[k,stats(p,v)]))}));
const candidates=all.slice(2),selected=candidates.reduce((b,x)=>x.train.success>b.train.success?x:b,candidates[0]);
const winners=Object.fromEntries(['select','switch','state','adjust','two-draw'].map(type=>[type,candidates.filter(x=>configs.find(c=>c.key===x.key).type===type).reduce((b,x)=>!b||x.train.success>b.train.success?x:b,null)]));
const compared=Object.fromEntries([selected,...Object.values(winners)].map(c=>[c.key,Object.fromEntries(['L14','L100'].map(base=>{let wins=0,losses=0;for(let t=cut;t<N;t++){const a=!h[t].includes(predictions[c.key][t]),b=!h[t].includes(predictions[base][t]);wins+=Number(a&&!b);losses+=Number(!a&&b);}return[base,{wins,losses}];}))]));
for(const t of [cut,cut+13,N-50,N-1]){const truncated=compute(h.slice(0,t));for(const [k,p]of Object.entries(truncated))assert.equal(p[t],predictions[k][t],`${k} leaks at ${t}`);}
// Independent check of simple selector across the common measured history.
for(const c of configs.filter(c=>c.type==='select'))for(let t=302;t<N;t++){
  const scores=[0,1].map(j=>{const base=predictions[j?'L100':'L14'];return c.weight*Number(h[t-1].includes(base[t-1]))+Number(h[t-2].includes(base[t-2]))+c.appearance*(Number(h[t-1].includes(base[t]))+Number(h[t-2].includes(base[t])));});const j=scores[0]===scores[1]?c.tie:scores[0]<scores[1]?0:1;assert.equal(predictions[c.key][t],predictions[j?'L100':'L14'][t]);
}
const report={protocol,selected:selected.key,winners:Object.fromEntries(Object.entries(winners).map(([k,v])=>[k,v.key])),compared,verification:{prefixChecks:(configs.length+2)*4,independentSelectorChecks:18*(N-302),passed:true},all};
fs.writeFileSync(path.join(__dirname,'two-period-results.json'),JSON.stringify(report,null,2));
const csv=['year,period,algorithm,predicted,actual,success'];for(const[k,p]of Object.entries(predictions))for(let t=N-200;t<N;t++)csv.push([raw[t].year,raw[t].No,k,p[t],h[t].join('|'),Number(!h[t].includes(p[t]))].join(','));fs.writeFileSync(path.join(__dirname,'two-period-predictions.csv'),csv.join('\n'));
console.log(JSON.stringify({count:configs.length,selected:selected.key,winners:report.winners,comparison:compared,rows:[all[0],all[1],...Object.values(winners)].map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k==='key'?v:`${v.success}/${v.count}`]))),best200:candidates.reduce((b,x)=>x.last200.success>b.last200.success?x:b,candidates[0]).key,verification:report.verification},null,2));

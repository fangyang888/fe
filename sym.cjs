const fs = require('fs');
const text = fs.readFileSync('public/history.txt', 'utf8');
const rows = text.trim().split('\n')
  .filter(l => l.trim())
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)))
  .filter(r => r.length === 7 && r.every(n => !isNaN(n)));
const N = rows.length;
const OPTS = { overlapThresh:1, decay:0.80, protectWindow:2, repeatThresh:0.15, skipThresh:0.20 };

// 所有差值命中率
const deltaRate = {};
for (let delta = 1; delta <= 48; delta++) {
  let hits = 0;
  for (let i=1;i<N;i++) for (const prev of rows[i-1]) { const t=((prev-1+delta)%49)+1; if(rows[i].includes(t))hits++; }
  deltaRate[delta] = hits / ((N-1)*7);
}

// 对称对分析
console.log('=== delta对称对（delta + 49-delta）命中率之和 ===');
const symPairs = [];
for (let d=1;d<=24;d++) {
  const combined = deltaRate[d] + deltaRate[49-d];
  symPairs.push({ d, r1: deltaRate[d], r2: deltaRate[49-d], combined });
}
symPairs.sort((a,b)=>b.combined-a.combined);
symPairs.slice(0,8).forEach(p =>
  console.log(`+${p.d}(${(p.r1*100).toFixed(2)}%) + +${49-p.d}(${(p.r2*100).toFixed(2)}%) = ${(p.combined*100).toFixed(2)}%`)
);

// 二阶差值
let sameD=0, totalD=0;
for (let i=2;i<N;i++) {
  for (const n1 of rows[i-2]) for (const n2 of rows[i-1]) {
    const d=((n2-n1+49)%49)||49;
    const target=((n2-1+d)%49)+1;
    totalD++; if(rows[i].includes(target))sameD++;
  }
}
console.log(`\n二阶差值延续: ${(sameD/totalD*100).toFixed(2)}% 基准14.29%`);

// baseKill
function baseKill(hist, extraProtect=new Set()) {
  const {overlapThresh,decay,protectWindow,repeatThresh,skipThresh}=OPTS;
  const hn=hist.length; const lastRow=hist[hn-1];
  const afterScore=new Array(50).fill(0); let simCount=0;
  for(let i=0;i<hn-1;i++){const ov=hist[i].filter(n=>lastRow.includes(n)).length;if(ov>=overlapThresh){hist[i+1].forEach(n=>{afterScore[n]++;});simCount++;}}
  const wFreq=new Array(50).fill(0);
  hist.forEach((row,idx)=>{const age=hn-1-idx;const w=Math.pow(decay,age);row.forEach(n=>{wFreq[n]+=w;});});
  const protect=new Set([...extraProtect]);
  hist.slice(-protectWindow).forEach(r=>r.forEach(n=>protect.add(n)));
  for(let n=1;n<=49;n++){
    if(protect.has(n))continue;
    const apps=[]; hist.forEach((row,idx)=>{if(row.includes(n))apps.push(idx);});
    if(apps.length<3)continue;
    const li=apps[apps.length-1];
    if(li===hn-1){let rc=0,rt=0;for(let j=0;j<hn-1;j++){if(hist[j].includes(n)){rt++;if(hist[j+1].includes(n))rc++;}}if(rt>2&&rc/rt>=repeatThresh)protect.add(n);}
    if(li===hn-2){let sk=0,ap=0;for(let j=0;j<hn-2;j++){if(hist[j].includes(n)&&!hist[j+1].includes(n)){ap++;if(hist[j+2].includes(n))sk++;}}if(ap>2&&sk/ap>=skipThresh)protect.add(n);}
  }
  const scored=[];
  for(let n=1;n<=49;n++){if(protect.has(n))continue;const ms=simCount>0?afterScore[n]/simCount:0;scored.push({n,score:ms*0.6+wFreq[n]*0.4});}
  scored.sort((a,b)=>a.score-b.score);
  return scored.slice(0,4).map(x=>x.n);
}

function test(label, fn) {
  let p=0,t=0,c=0;
  for(let i=20;i<N-1;i++){const hist=rows.slice(0,i+1);const kill=baseKill(hist,fn(hist));if(kill.length<4)continue;const next=new Set(rows[i+1]);const hit=kill.filter(n=>!next.has(n)).length;c+=hit;t++;if(hit===4)p++;}
  const pct=(p/t*100).toFixed(1); const acc=(c/t/4*100).toFixed(1);
  console.log(`${parseFloat(pct)>70.4?'🔺':parseFloat(pct)>68?'▲':'  '} ${label}: 全中${p}/${t} (${pct}%) 准确率${acc}%`);
  return parseFloat(pct);
}

console.log('\n=== 环形对称策略测试（基准70.4%）===');

// 基准
test('基准(+31,+2,+38,+48,-1)', h=>{const s=new Set();h[h.length-1].forEach(n=>{s.add(n>1?n-1:49);[31,2,38,48].forEach(d=>s.add(((n-1+d)%49)+1));});return s;});

// 加对称对：+2的对称+47，+31的对称+18，+38的对称+11
test('+2+47 +31+18 +38+11对称完整对', h=>{const s=new Set();h[h.length-1].forEach(n=>{s.add(n>1?n-1:49);[31,18,2,47,38,11,48].forEach(d=>s.add(((n-1+d)%49)+1));});return s;});

// 只用最强对称对
test('最强对称对(+2+47)', h=>{const s=new Set();h[h.length-1].forEach(n=>{s.add(n>1?n-1:49);[2,47,31,38,48].forEach(d=>s.add(((n-1+d)%49)+1));});return s;});

// top对称对的两个delta都加
const topPairs = symPairs.slice(0,4).flatMap(p=>[p.d, 49-p.d]);
console.log('top4对称对的delta:', topPairs);
test('top4对称对全部delta', h=>{const s=new Set();h[h.length-1].forEach(n=>{s.add(n>1?n-1:49);topPairs.forEach(d=>s.add(((n-1+d)%49)+1));});return s;});

// 二阶差值保护：前期到当期的delta，保护当期+同delta（延续性）
test('二阶差值延续保护', h=>{
  const s=new Set(); const hn=h.length; if(hn<2)return s;
  const last=h[hn-1]; const prev=h[hn-2];
  const usedDeltas=new Set();
  for(const p of prev) for(const c of last) usedDeltas.add(((c-p+49)%49)||49);
  last.forEach(n=>usedDeltas.forEach(d=>s.add(((n-1+d)%49)+1)));
  return s;
});

// 二阶差值 + 基准热差值
test('二阶差值 + 热差值基准', h=>{
  const s=new Set(); const hn=h.length;
  const last=h[hn-1];
  last.forEach(n=>{s.add(n>1?n-1:49);[31,2,38,48].forEach(d=>s.add(((n-1+d)%49)+1));});
  if(hn>=2){
    const prev=h[hn-2]; const usedD=new Set();
    for(const p of prev) for(const c of last) usedD.add(((c-p+49)%49)||49);
    last.forEach(n=>usedD.forEach(d=>s.add(((n-1+d)%49)+1)));
  }
  return s;
});

// 动态：每次用全量历史找top5 delta
test('全量历史动态top5 delta', h=>{
  const s=new Set(); const hn=h.length; if(hn<10)return s;
  const dr={};
  for(let i=1;i<hn-1;i++) for(const p of h[i]) for(const c of h[i+1]){const d=((c-p+49)%49)||49;dr[d]=(dr[d]||0)+1;}
  const top5=Object.entries(dr).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([d])=>parseInt(d));
  h[hn-1].forEach(n=>{s.add(n>1?n-1:49);top5.forEach(d=>s.add(((n-1+d)%49)+1));});
  return s;
});

// 7的倍数保护（49=7×7）
test('7倍数差值保护(+7,+14,+21,+28,+35,+42)', h=>{
  const s=new Set(); const last=h[h.length-1];
  last.forEach(n=>{s.add(n>1?n-1:49);[31,2,38,48].forEach(d=>s.add(((n-1+d)%49)+1));[7,14,21,28,35,42].forEach(d=>s.add(((n-1+d)%49)+1));});
  return s;
});

// 前期最大值/最小值相关的对称保护
test('极值对称保护', h=>{
  const s=new Set(); const hn=h.length; const last=h[hn-1];
  last.forEach(n=>{s.add(n>1?n-1:49);[31,2,38,48].forEach(d=>s.add(((n-1+d)%49)+1));});
  const mx=Math.max(...last); const mn=Math.min(...last);
  // 极值的对称点
  s.add(50-mx); s.add(50-mn);
  s.add(mx<49?mx+1:1); s.add(mn>1?mn-1:49);
  return s;
});

const fs = require('fs');
const text = fs.readFileSync('public/history.txt', 'utf8');
const rows = text.trim().split('\n')
  .filter(l => l.trim())
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)))
  .filter(r => r.length === 7 && r.every(n => !isNaN(n)));
const N = rows.length;
const OPTS = { overlapThresh:1, decay:0.80, protectWindow:2, repeatThresh:0.15, skipThresh:0.20 };

// ============================================================
// 深度数学规律分析
// ============================================================

// 1. 测试所有单步差值的保护效果（哪个+delta保护率最高）
console.log('=== 单步差值保护效果（每个+delta作为保护）===');
const deltaResults = [];
for (let delta = 1; delta <= 48; delta++) {
  // 统计「上期出现n，下期出现(n+delta)%49」的命中率
  let hits = 0, total = 0;
  for (let i = 1; i < N; i++) {
    for (const prev of rows[i-1]) {
      const target = ((prev - 1 + delta) % 49) + 1;
      total++;
      if (rows[i].includes(target)) hits++;
    }
  }
  const rate = hits / total;
  deltaResults.push({ delta, hits, total, rate });
}
deltaResults.sort((a,b) => b.rate - a.rate);
console.log('命中率最高的差值(top10):');
deltaResults.slice(0,10).forEach(d => console.log(`  +${d.delta}: ${(d.rate*100).toFixed(2)}% (${d.hits}/${d.total})`));
console.log('命中率最低的差值(bot10):');
deltaResults.slice(-10).forEach(d => console.log(`  +${d.delta}: ${(d.rate*100).toFixed(2)}% (${d.hits}/${d.total})`));

// 2. 测试前2期差值组合
console.log('\n=== 前2期号码的差值组合 ===');
// 当期号码 = 前期a + 前2期b 的某个差值变换
let combo_hits = 0, combo_total = 0;
for (let i = 2; i < N; i++) {
  const prev1 = rows[i-1];
  const prev2 = rows[i-2];
  const curr = new Set(rows[i]);
  // 前期+前2期每个号码之差
  for (const a of prev1) {
    for (const b of prev2) {
      const target = ((a + b - 2) % 49) + 1;
      combo_total++;
      if (curr.has(target)) combo_hits++;
    }
  }
}
console.log(`前期a+前2期b (mod49+1): ${(combo_hits/combo_total*100).toFixed(2)}% 基准14.29%`);

// 3. 测试号码间距规律：相邻两期开出号码的间距统计
console.log('\n=== 连续2期号码集合特征 ===');
// 前期7个号和当期7个号的重叠数分布
const overlapDist = Array(8).fill(0);
for (let i = 1; i < N; i++) {
  const prev = new Set(rows[i-1]);
  const overlap = rows[i].filter(n => prev.has(n)).length;
  overlapDist[overlap]++;
}
console.log('重叠数分布:', overlapDist.map((c,i) => `${i}个:${c}期`).join(' '));
console.log('平均重叠:', (overlapDist.reduce((s,c,i)=>s+c*i,0)/(N-1)).toFixed(2));

// 4. 测试「前期号码的各种变换组合」作为保护集的效果
console.log('\n=== 变换组合保护效果测试 ===');

function baseKill(hist, extraProtect = new Set()) {
  const { overlapThresh, decay, protectWindow, repeatThresh, skipThresh } = OPTS;
  const hn = hist.length;
  const lastRow = hist[hn-1];
  const afterScore = new Array(50).fill(0);
  let simCount = 0;
  for (let i=0;i<hn-1;i++) {
    const ov=hist[i].filter(n=>lastRow.includes(n)).length;
    if(ov>=overlapThresh){hist[i+1].forEach(n=>{afterScore[n]++;});simCount++;}
  }
  const wFreq = new Array(50).fill(0);
  hist.forEach((row,idx)=>{const age=hn-1-idx;const w=Math.pow(decay,age);row.forEach(n=>{wFreq[n]+=w;});});
  const protect = new Set([...extraProtect]);
  hist.slice(-protectWindow).forEach(r=>r.forEach(n=>protect.add(n)));
  for (let n=1;n<=49;n++) {
    if(protect.has(n))continue;
    const apps=[]; hist.forEach((row,idx)=>{if(row.includes(n))apps.push(idx);});
    if(apps.length<3)continue;
    const lastIdx=apps[apps.length-1];
    if(lastIdx===hn-1){let rc=0,rt=0;for(let j=0;j<hn-1;j++){if(hist[j].includes(n)){rt++;if(hist[j+1].includes(n))rc++;}}if(rt>2&&rc/rt>=repeatThresh)protect.add(n);}
    if(lastIdx===hn-2){let sk=0,ap=0;for(let j=0;j<hn-2;j++){if(hist[j].includes(n)&&!hist[j+1].includes(n)){ap++;if(hist[j+2].includes(n))sk++;}}if(ap>2&&sk/ap>=skipThresh)protect.add(n);}
  }
  const scored=[];
  for(let n=1;n<=49;n++){
    if(protect.has(n))continue;
    const ms=simCount>0?afterScore[n]/simCount:0;
    scored.push({n,score:ms*0.6+wFreq[n]*0.4});
  }
  scored.sort((a,b)=>a.score-b.score);
  return scored.slice(0,4).map(x=>x.n);
}

function testProtect(label, protectFn) {
  let p=0,t=0,c=0;
  for (let i=20;i<N-1;i++) {
    const hist=rows.slice(0,i+1);
    const extra = protectFn(hist);
    const kill=baseKill(hist, extra);
    if(kill.length<4)continue;
    const next=new Set(rows[i+1]);
    const hit=kill.filter(n=>!next.has(n)).length;
    c+=hit;t++;if(hit===4)p++;
  }
  const pct=(p/t*100).toFixed(1);
  const acc=(c/t/4*100).toFixed(1);
  const flag = parseFloat(pct)>63.9?'🔺':parseFloat(pct)>62?'▲':'  ';
  console.log(`${flag} ${label}: 全中${p}/${t} (${pct}%) 准确率${acc}%`);
  return parseFloat(pct);
}

// 当前算法（+2/-1保护）作为基准
testProtect('当前基准(+2/-1)', hist => {
  const s = new Set();
  hist[hist.length-1].forEach(n => {
    s.add(n<48?n+2:n-47);
    s.add(n>1?n-1:49);
  });
  return s;
});

// 测试各种差值组合
const topDeltas = deltaResults.slice(0,5).map(d=>d.delta); // 命中率最高的5个delta
const botDeltas = deltaResults.slice(-5).map(d=>d.delta);  // 命中率最低的5个delta
console.log('最热差值:', topDeltas);
console.log('最冷差值:', botDeltas);

// 用最热的top3 delta作为保护
testProtect(`热差值保护(top3:${topDeltas.slice(0,3)})`, hist => {
  const s = new Set();
  hist[hist.length-1].forEach(n => {
    topDeltas.slice(0,3).forEach(d => s.add(((n-1+d)%49)+1));
  });
  return s;
});

// 用最热的top5 delta作为保护
testProtect(`热差值保护(top5)`, hist => {
  const s = new Set();
  hist[hist.length-1].forEach(n => {
    topDeltas.forEach(d => s.add(((n-1+d)%49)+1));
  });
  return s;
});

// +2/-1 + 最热delta
testProtect('+2/-1 + 热差值top3', hist => {
  const s = new Set();
  const last = hist[hist.length-1];
  last.forEach(n => {
    s.add(n<48?n+2:n-47);
    s.add(n>1?n-1:49);
    topDeltas.slice(0,3).forEach(d => s.add(((n-1+d)%49)+1));
  });
  return s;
});

// 前期+前2期的和作为保护
testProtect('前2期号码配对和保护', hist => {
  const s = new Set();
  const hn = hist.length;
  if (hn < 2) return s;
  const prev1 = hist[hn-1], prev2 = hist[hn-2];
  prev1.forEach(a => prev2.forEach(b => {
    const t = ((a+b-2)%49)+1;
    s.add(t);
  }));
  return s;
});

// 前期sum%49+1
testProtect('前期7数之和%49+1保护', hist => {
  const s = new Set();
  const last = hist[hist.length-1];
  s.add((last.reduce((a,b)=>a+b,0)%49)+1);
  return s;
});

// 前2期中位数
testProtect('前2期中位数保护', hist => {
  const s = new Set();
  const hn = hist.length;
  if (hn < 2) return s;
  const all = [...hist[hn-1],...hist[hn-2]].sort((a,b)=>a-b);
  s.add(all[Math.floor(all.length/2)]);
  s.add(all[Math.floor(all.length/2)-1]);
  return s;
});

// 最优：+2/-1 + 前期和
testProtect('+2/-1 + 前期和%49', hist => {
  const s = new Set();
  const last = hist[hist.length-1];
  last.forEach(n => { s.add(n<48?n+2:n-47); s.add(n>1?n-1:49); });
  s.add((last.reduce((a,b)=>a+b,0)%49)+1);
  return s;
});

// 动态：用最近20期实时计算最优delta
testProtect('动态热差值(最近20期)', hist => {
  const s = new Set();
  const hn = hist.length;
  if (hn < 22) return s;
  // 统计最近20期最热的3个delta
  const recentDelta = {};
  for (let i=hn-20;i<hn-1;i++) {
    for (const prev of hist[i]) {
      for (const curr of hist[i+1]) {
        const d = ((curr-prev+49)%49)||49;
        recentDelta[d]=(recentDelta[d]||0)+1;
      }
    }
  }
  const top3 = Object.entries(recentDelta).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([d])=>parseInt(d));
  hist[hn-1].forEach(n => top3.forEach(d => s.add(((n-1+d)%49)+1)));
  return s;
});

// 当前+2/-1 + 动态热差值
testProtect('+2/-1 + 动态热差值', hist => {
  const s = new Set();
  const hn = hist.length;
  const last = hist[hn-1];
  last.forEach(n => { s.add(n<48?n+2:n-47); s.add(n>1?n-1:49); });
  if (hn >= 22) {
    const recentDelta = {};
    for (let i=hn-20;i<hn-1;i++) {
      for (const prev of hist[i]) {
        for (const curr of hist[i+1]) {
          const d=((curr-prev+49)%49)||49;
          recentDelta[d]=(recentDelta[d]||0)+1;
        }
      }
    }
    const top3=Object.entries(recentDelta).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([d])=>parseInt(d));
    last.forEach(n => top3.forEach(d => s.add(((n-1+d)%49)+1)));
  }
  return s;
});

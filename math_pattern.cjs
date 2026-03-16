const fs = require('fs');
const text = fs.readFileSync('public/history.txt', 'utf8');
const rows = text.trim().split('\n')
  .filter(l => l.trim())
  .map(l => l.split(',').map(n => parseInt(n.trim(), 10)))
  .filter(r => r.length === 7 && r.every(n => !isNaN(n)));
const N = rows.length;

console.log('=== 前2期与当期的数学关系分析 ===');

// 1. 差值分析：当期号码 = 前期号码 + delta
// 统计所有「上期某号 + delta = 当期某号」的 delta 分布
console.log('\n--- 上期→当期 差值(delta)分布 ---');
const delta1 = {};
for (let i=1;i<N;i++) {
  for (const prev of rows[i-1]) {
    for (const curr of rows[i]) {
      const d = ((curr - prev + 49) % 49) || 49; // 环形差值
      delta1[d] = (delta1[d]||0) + 1;
    }
  }
}
const sortedDelta1 = Object.entries(delta1).sort((a,b)=>b[1]-a[1]);
console.log('最常见差值(top15):', sortedDelta1.slice(0,15).map(([d,c])=>`+${d}(${c}次)`).join(' '));
console.log('最少见差值(bot10):', sortedDelta1.slice(-10).map(([d,c])=>`+${d}(${c}次)`).join(' '));

// 2. 前期号码通过特定变换后，命中当期的概率
console.log('\n--- 变换命中率测试 ---');
const transforms = [
  { name: '+1', fn: n => (n%49)+1 },
  { name: '+2', fn: n => ((n+1)%49)+1 },
  { name: '+3', fn: n => ((n+2)%49)+1 },
  { name: '+7', fn: n => ((n+6)%49)+1 },
  { name: '-1', fn: n => ((n-2+49)%49)+1 },
  { name: '-7', fn: n => ((n-8+49)%49)+1 },
  { name: '×2%49', fn: n => (n*2-1)%49+1 },
  { name: '镜像(50-n)', fn: n => 50-n },
  { name: '尾数相同', fn: n => null }, // special
  { name: 'sum前2期%49+1', fn: null }, // special
];

for (let i=1;i<N;i++) {
  // 占位
}

// 统计前期7个数通过各变换后命中当期的次数
const hitCounts = {};
const totalPossible = {};
for (const t of transforms.slice(0,8)) {
  let hits = 0;
  for (let i=1;i<N;i++) {
    const transformed = rows[i-1].map(t.fn);
    const currSet = new Set(rows[i]);
    hits += transformed.filter(n => n >= 1 && n <= 49 && currSet.has(n)).length;
  }
  const total = (N-1) * 7;
  console.log(`变换${t.name}: 命中${hits}/${total}次 (${(hits/total*100).toFixed(2)}%) 期望基准${(7/49*100).toFixed(2)}%`);
}

// 3. 更复杂：前2期合计、前2期中位数、前2期异或等
console.log('\n--- 前2期综合特征 ---');
let sumHits=0, medHits=0, xorHits=0;
for (let i=2;i<N;i++) {
  const currSet = new Set(rows[i]);
  // 前2期所有号码之和 mod 49 + 1
  const allPrev = [...rows[i-1], ...rows[i-2]];
  const sumMod = (allPrev.reduce((s,n)=>s+n,0) % 49) + 1;
  if (currSet.has(sumMod)) sumHits++;
  // 前2期中位数
  const sorted = [...allPrev].sort((a,b)=>a-b);
  const med = sorted[Math.floor(sorted.length/2)];
  if (currSet.has(med)) medHits++;
  // 前2期最大值+最小值
  const minmax = (Math.min(...allPrev) + Math.max(...allPrev)) % 49 + 1;
  if (currSet.has(minmax)) xorHits++;
}
console.log(`前2期和%49+1 命中率: ${(sumHits/(N-2)*100).toFixed(1)}%`);
console.log(`前2期中位数 命中率: ${(medHits/(N-2)*100).toFixed(1)}%`);
console.log(`(min+max)%49+1 命中率: ${(xorHits/(N-2)*100).toFixed(1)}%`);

// 4. 关键：前期开的数+delta 最常在「下下期」出现的规律
console.log('\n--- 上期号码对下期杀码的影响 ---');
// 统计「上期出现过n，下期n出现的概率」vs「上期没出现n，下期n出现的概率」
let appeared_then_appeared = 0, appeared_total = 0;
let notAppeared_then_appeared = 0, notAppeared_total = 0;
for (let i=1;i<N;i++) {
  const prevSet = new Set(rows[i-1]);
  const currSet = new Set(rows[i]);
  for (let n=1;n<=49;n++) {
    if (prevSet.has(n)) { appeared_total++; if(currSet.has(n)) appeared_then_appeared++; }
    else { notAppeared_total++; if(currSet.has(n)) notAppeared_then_appeared++; }
  }
}
console.log(`上期出现→下期再出: ${(appeared_then_appeared/appeared_total*100).toFixed(1)}%`);
console.log(`上期未出→下期出现: ${(notAppeared_then_appeared/notAppeared_total*100).toFixed(1)}%`);
console.log(`基准概率(7/49): ${(7/49*100).toFixed(1)}%`);

// 5. delta组合：前期a+前期b=当期c 的三元组规律
console.log('\n--- 前期两数之和=当期某数（mod 49）---');
let tripleHits=0, triplePossible=0;
for (let i=1;i<N;i++) {
  const prevNums = rows[i-1];
  const currSet = new Set(rows[i]);
  for (let a=0;a<prevNums.length;a++) {
    for (let b=a+1;b<prevNums.length;b++) {
      const s = (prevNums[a]+prevNums[b]-1)%49+1;
      triplePossible++;
      if (currSet.has(s)) tripleHits++;
    }
  }
}
console.log(`前期两数之和%49 命中当期: ${tripleHits}/${triplePossible} (${(tripleHits/triplePossible*100).toFixed(2)}%) 基准:${(7/49*100).toFixed(2)}%`);

// 6. 前期最大值/最小值规律
console.log('\n--- 前期极值规律 ---');
let maxHit=0, minHit=0, maxPlus1=0, minMinus1=0;
for (let i=1;i<N;i++) {
  const mx = Math.max(...rows[i-1]);
  const mn = Math.min(...rows[i-1]);
  const currSet = new Set(rows[i]);
  if(currSet.has(mx)) maxHit++;
  if(currSet.has(mn)) minHit++;
  if(mx<49&&currSet.has(mx+1)) maxPlus1++;
  if(mn>1&&currSet.has(mn-1)) minMinus1++;
}
console.log(`前期最大值 下期再出: ${(maxHit/(N-1)*100).toFixed(1)}%`);
console.log(`前期最小值 下期再出: ${(minHit/(N-1)*100).toFixed(1)}%`);
console.log(`前期最大+1 下期出现: ${(maxPlus1/(N-1)*100).toFixed(1)}%`);
console.log(`前期最小-1 下期出现: ${(minMinus1/(N-1)*100).toFixed(1)}%`);

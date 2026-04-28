const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

let totalCorrect = 0;
let totalPredicted = 0;
const testPeriods = 50;

for (let i = hist.length - testPeriods; i < hist.length; i++) {
  const subHist = hist.slice(0, i);
  const actualSet = new Set(hist[i]);
  
  // Strategy: Count occurrences in subHist, predict bottom 10
  const counts = Array(50).fill(0);
  for (const row of subHist) {
    for (const n of row) counts[n]++;
  }
  
  const cands = [];
  for (let n = 1; n <= 49; n++) {
    cands.push({n, c: counts[n]});
  }
  cands.sort((a,b) => a.c - b.c); // Lowest count first
  
  const killNums = cands.slice(0, 10).map(c => c.n);
  
  const failed = killNums.filter(n => actualSet.has(n));
  totalCorrect += killNums.length - failed.length;
  totalPredicted += killNums.length;
}

console.log('Accuracy (Coldest All Time):', (totalCorrect / totalPredicted) * 100 + '%');

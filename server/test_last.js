const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

let totalCorrect = 0;
let totalPredicted = 0;
const testPeriods = 50;

for (let i = hist.length - testPeriods; i < hist.length; i++) {
  const subHist = hist.slice(0, i);
  const actualSet = new Set(hist[i]);
  
  const lastRow = subHist[subHist.length - 1];
  const killNums = lastRow; // Predict 7 numbers from last period will NOT appear
  
  const failed = killNums.filter(n => actualSet.has(n));
  totalCorrect += killNums.length - failed.length;
  totalPredicted += killNums.length;
}

console.log('Accuracy (Kill previous 7):', (totalCorrect / totalPredicted) * 100 + '%');

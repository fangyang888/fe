const { PredictorService } = require('./dist/src/predictor/predictor.service.js');
const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

const svc = new PredictorService({ findAll: async () => d });

let totalCorrect = 0;
let totalPredicted = 0;
const testPeriods = 50;
const w = 20;

for (let i = hist.length - testPeriods; i < hist.length; i++) {
  const subHist = hist.slice(0, i);
  const actualSet = new Set(hist[i]);

  // Strategy 1: Hottest in recent `w`
  const counts = Array(50).fill(0);
  const recent = subHist.slice(-w);
  for (const row of recent) {
    for (const n of row) counts[n]++;
  }
  const hotCands = [];
  for (let n = 1; n <= 49; n++) hotCands.push({n, c: counts[n]});
  hotCands.sort((a,b) => b.c - a.c); // Highest count first
  const hotKills = hotCands.slice(0, 15).map(x => x.n);
  
  // Strategy 2: Server adaptive
  const srvKillsObj = svc.strategyServerSide(subHist).predictions;
  const srvKills = srvKillsObj.map(x => x.n);

  // Strategy 3: Extreme cold (hasn't appeared in longest time)
  const coldCands = [];
  for (let n = 1; n <= 49; n++) {
    let lastSeen = 0;
    for (let k = subHist.length - 1; k >= 0; k--) {
      if (subHist[k].includes(n)) { lastSeen = subHist.length - 1 - k; break; }
    }
    coldCands.push({n, miss: lastSeen});
  }
  coldCands.sort((a,b) => b.miss - a.miss); // Longest miss first
  const coldKills = coldCands.slice(0, 15).map(x => x.n);

  // Ensemble: we want to pick 10 numbers.
  // Let's vote. 
  // Hot gets +1, Srv gets +2
  const votes = Array(50).fill(0);
  for (const n of hotKills.slice(0, 8)) votes[n] += 1;
  for (const n of srvKills) votes[n] += 1.5;
  for (const n of coldKills.slice(0, 5)) votes[n] += 1; // Adding extremely cold numbers? They tend to stay cold.

  const finalCands = [];
  for (let n = 1; n <= 49; n++) {
    if (votes[n] > 0) finalCands.push({n, v: votes[n]});
  }
  finalCands.sort((a,b) => b.v - a.v);
  
  // Fill up to 10
  const killNums = finalCands.slice(0, 10).map(x => x.n);
  if (killNums.length < 10) {
      for(let n=1; n<=49 && killNums.length < 10; n++) {
          if (!killNums.includes(n)) killNums.push(n);
      }
  }

  const failed = killNums.filter(n => actualSet.has(n));
  totalCorrect += killNums.length - failed.length;
  totalPredicted += killNums.length;
}

console.log('Ensemble Accuracy:', (totalCorrect / totalPredicted) * 100 + '%');

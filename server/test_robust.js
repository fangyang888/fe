const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

const testPeriods = 100;

let totalCorrect = 0;
let totalPredicted = 0;

const wHot = 35;
const topHot = 8;
const wCold = 35;
const topCold = 2;

for (let i = hist.length - testPeriods; i < hist.length; i++) {
    const subHist = hist.slice(0, i);
    const actualSet = new Set(hist[i]);
    
    const countsHot = Array(50).fill(0);
    const recentHot = subHist.slice(-wHot);
    for (const row of recentHot) {
        for (const n of row) countsHot[n]++;
    }
    
    const candsHot = [];
    for (let n = 1; n <= 49; n++) candsHot.push({n, c: countsHot[n]});
    candsHot.sort((a,b) => b.c - a.c); // Highest count first
    const hotKills = candsHot.slice(0, topHot).map(x => x.n);
    
    const countsCold = Array(50).fill(0);
    const recentCold = subHist.slice(-wCold);
    for (const row of recentCold) {
        for (const n of row) countsCold[n]++;
    }
    
    const candsCold = [];
    for (let n = 1; n <= 49; n++) {
        if (!hotKills.includes(n)) {
            candsCold.push({n, c: countsCold[n]});
        }
    }
    candsCold.sort((a,b) => a.c - b.c); // Lowest count first
    const coldKills = candsCold.slice(0, topCold).map(x => x.n);
    
    const killNums = [...hotKills, ...coldKills];
    
    const failed = killNums.filter(n => actualSet.has(n));
    totalCorrect += killNums.length - failed.length;
    totalPredicted += killNums.length;
}

console.log('Robustness over 100 periods:', (totalCorrect / totalPredicted) * 100, '%');

const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

const testPeriods = 100;
let totalCorrect = 0;
let totalPredicted = 0;

for (let i = hist.length - testPeriods; i < hist.length; i++) {
    const subHist = hist.slice(0, i);
    const actualSet = new Set(hist[i]);
    
    // Dynamic search over last 30 periods
    const evalWindow = 30;
    let bestAcc = 0;
    let bestP = { wHot: 35, topHot: 8 };
    
    for (let wHot = 10; wHot <= 45; wHot += 5) {
        for (let topHot = 4; topHot <= 10; topHot += 2) {
            let correct = 0;
            let total = 0;
            const topCold = 10 - topHot;
            
            for (let j = subHist.length - evalWindow; j < subHist.length; j++) {
                const subsub = subHist.slice(0, j);
                const nextSet = new Set(subHist[j]);
                
                const cHot = Array(50).fill(0);
                for (const row of subsub.slice(-wHot)) {
                    for(const n of row) cHot[n]++;
                }
                const candHot = [];
                for(let n=1; n<=49; n++) candHot.push({n, c: cHot[n]});
                candHot.sort((a,b) => b.c - a.c);
                const hotKills = candHot.slice(0, topHot).map(x=>x.n);
                
                const candCold = [];
                for(let n=1; n<=49; n++) {
                    if(!hotKills.includes(n)) candCold.push({n, c: cHot[n]}); // Use same wHot for cold
                }
                candCold.sort((a,b) => a.c - b.c);
                const coldKills = candCold.slice(0, topCold).map(x=>x.n);
                
                const killNums = [...hotKills, ...coldKills];
                const failed = killNums.filter(n => nextSet.has(n));
                correct += killNums.length - failed.length;
                total += killNums.length;
            }
            const acc = correct / total;
            if (acc > bestAcc) {
                bestAcc = acc;
                bestP = { wHot, topHot };
            }
        }
    }
    
    // Use bestP to predict i
    const topCold = 10 - bestP.topHot;
    const cHot = Array(50).fill(0);
    for (const row of subHist.slice(-bestP.wHot)) {
        for(const n of row) cHot[n]++;
    }
    const candHot = [];
    for(let n=1; n<=49; n++) candHot.push({n, c: cHot[n]});
    candHot.sort((a,b) => b.c - a.c);
    const hotKills = candHot.slice(0, bestP.topHot).map(x=>x.n);
    
    const candCold = [];
    for(let n=1; n<=49; n++) {
        if(!hotKills.includes(n)) candCold.push({n, c: cHot[n]});
    }
    candCold.sort((a,b) => a.c - b.c);
    const coldKills = candCold.slice(0, topCold).map(x=>x.n);
    
    const killNums = [...hotKills, ...coldKills];
    const failed = killNums.filter(n => actualSet.has(n));
    totalCorrect += killNums.length - failed.length;
    totalPredicted += killNums.length;
}

console.log('Dynamic Robustness over 100 periods:', (totalCorrect / totalPredicted) * 100, '%');

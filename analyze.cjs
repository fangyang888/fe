const fs = require('fs');
const data = fs.readFileSync('public/history.txt', 'utf8');
const history = data.trim().split('\n').filter(l => l.trim()).map(line => line.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))).filter(r => r.length === 7);
console.log('Total rows:', history.length);

// 1. Repeat rate from prev row
let totalRepeats = 0;
for (let i = 1; i < history.length; i++) {
  const prev = new Set(history[i-1]);
  totalRepeats += history[i].filter(n => prev.has(n)).length;
}
console.log('Avg repeats from prev row:', (totalRepeats/(history.length-1)).toFixed(2));

// 2. LastRow kill rate
let lrS = 0, lrT = 0;
for (let i = 1; i < history.length; i++) {
  const prev = new Set(history[i-1]);
  const next = new Set(history[i]);
  prev.forEach(num => { lrT++; if (!next.has(num)) lrS++; });
}
console.log('LastRow kill rate:', (lrS/lrT*100).toFixed(1)+'%');

// 3. Backtest last 20 periods
console.log('\nBacktest Last 20:');
for (let t = Math.max(14, history.length - 20); t < history.length - 1; t++) {
  const lastRow = history[t];
  const nextRow = history[t + 1];
  const nextSet = new Set(nextRow);
  const leaked = lastRow.filter(n => nextSet.has(n));
  console.log('P'+(t+1)+' kill7: leaked='+leaked.length+' ('+leaked.join(',')+')');
}

// 4. Which numbers repeat most (gap=1)?
const repeatMap = {};
for (let i = 1; i < history.length; i++) {
  const prev = new Set(history[i-1]);
  history[i].forEach(n => { if (prev.has(n)) repeatMap[n] = (repeatMap[n] || 0) + 1; });
}
const srt = Object.entries(repeatMap).sort((a,b) => b[1] - a[1]);
console.log('\nTop repeaters:', srt.slice(0,15).map(e => e[0]+':'+e[1]).join(', '));

// 5. Digit repeat analysis
const dRepeat = {};
for (const n in repeatMap) { const d = parseInt(n) % 10; dRepeat[d] = (dRepeat[d]||0) + repeatMap[n]; }
console.log('Digit repeat:', Object.entries(dRepeat).sort((a,b)=>b[1]-a[1]).map(e=>e[0]+':'+e[1]).join(', '));

// 6. Consecutive appearance => repeat rate
console.log('\nConsecutive->Repeat analysis:');
let consRepeat = 0, consTotal = 0;
for (let i = 2; i < history.length; i++) {
  for (let num = 1; num <= 49; num++) {
    if (history[i-1].includes(num) && history[i-2].includes(num)) {
      consTotal++;
      if (history[i].includes(num)) consRepeat++;
    }
  }
}
console.log('If cons 2 periods, repeat rate:', (consRepeat/consTotal*100).toFixed(1)+'%');

// 7. Hot nums (3+ in 5 periods) repeat rate
let hotRepeat = 0, hotTotal = 0;
for (let i = 5; i < history.length; i++) {
  const freq = {};
  history.slice(i-5, i).flat().forEach(n => freq[n] = (freq[n]||0) + 1);
  for (const n in freq) {
    if (freq[n] >= 3) {
      hotTotal++;
      if (!history[i].includes(parseInt(n))) hotRepeat++;
    }
  }
}
console.log('Hot(3+/5) kill rate:', (hotRepeat/hotTotal*100).toFixed(1)+'%');

// 8. Gap pattern: if appeared in last 2 periods (not in lastRow), kill rate
let gapRepeat = 0, gapTotal = 0;
for (let i = 2; i < history.length; i++) {
  const lastRow = new Set(history[i-1]);
  for (let num = 1; num <= 49; num++) {
    if (!lastRow.has(num) && history[i-2].includes(num)) {
      gapTotal++;
      if (!history[i].includes(num)) gapRepeat++;
    }
  }
}
console.log('Gap1(not in last, in prev) kill rate:', (gapRepeat/gapTotal*100).toFixed(1)+'%');

// 9. Analyze pattern: numbers sharing same last digit as lastRow
let sameDigitKill = 0, sameDigitTotal = 0;
for (let i = 1; i < history.length; i++) {
  const lastDigits = new Set(history[i-1].map(n => n % 10));
  const nextSet = new Set(history[i]);
  for (let num = 1; num <= 49; num++) {
    if (lastDigits.has(num % 10) && !new Set(history[i-1]).has(num)) {
      sameDigitTotal++;
      if (!nextSet.has(num)) sameDigitKill++;
    }
  }
}
console.log('Same digit (not in lastRow) kill rate:', (sameDigitKill/sameDigitTotal*100).toFixed(1)+'%');

// 10. Sum pattern
console.log('\nSum analysis:');
history.slice(-5).forEach((row, i) => {
  const sum = row.reduce((a,b) => a+b, 0);
  console.log('Row', history.length-4+i, ': sum='+sum, 'avg='+(sum/7).toFixed(1));
});

// 11. Odd/Even balance
console.log('\nOdd/Even in last 5:');
history.slice(-5).forEach((row, i) => {
  const odd = row.filter(n => n%2===1).length;
  console.log('Row', history.length-4+i, ': odd='+odd, 'even='+(7-odd));
});

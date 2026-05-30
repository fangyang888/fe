require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'fangyang6579',
    database: process.env.DB_NAME || 'fe_prediction',
  });

  const [rows] = await connection.execute(
    'SELECT n1, n2, n3, n4, n5, n6, n7, year, No FROM history ORDER BY year ASC, No ASC'
  );

  const history = rows.map(r => {
    const arr = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number);
    arr.sort((a, b) => a - b);
    return arr;
  });

  const testPeriods = 300;
  const N = history.length;

  const globalFreq = Array(50).fill(0);
  for (const row of history) {
    for (const n of row) globalFreq[n]++;
  }

  const results = {
    smallestLast1: { correct: 0, total: 0 },
    largestLast1: { correct: 0, total: 0 },
    medianLast1: { correct: 0, total: 0 },
    coldestInLast2: { correct: 0, total: 0 },
    hottestInLast2: { correct: 0, total: 0 },
    repeatPriority: { correct: 0, total: 0 }
  };

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw1 = history[i - 1]; // 上 1 期
    const prevDraw2 = history[i - 2]; // 上 2 期

    const unionSet = new Set([...prevDraw1, ...prevDraw2]);
    const unionList = Array.from(unionSet);
    const intersectList = prevDraw1.filter(n => prevDraw2.includes(n));

    // 1. 上期最小号排除 (n1)
    const p1 = prevDraw1[0];
    if (!currentDraw.includes(p1)) results.smallestLast1.correct++;
    results.smallestLast1.total++;

    // 2. 上期最大号排除 (n7)
    const p2 = prevDraw1[6];
    if (!currentDraw.includes(p2)) results.largestLast1.correct++;
    results.largestLast1.total++;

    // 3. 上期中位数排除 (n4)
    const p3 = prevDraw1[3];
    if (!currentDraw.includes(p3)) results.medianLast1.correct++;
    results.medianLast1.total++;

    // 4. 上两期中最冷的号
    const sortedCold = [...unionList].sort((a, b) => globalFreq[a] - globalFreq[b]);
    const p4 = sortedCold[0];
    if (!currentDraw.includes(p4)) results.coldestInLast2.correct++;
    results.coldestInLast2.total++;

    // 5. 上两期中最热的号
    const sortedHot = [...unionList].sort((a, b) => globalFreq[b] - globalFreq[a]);
    const p5 = sortedHot[0];
    if (!currentDraw.includes(p5)) results.hottestInLast2.correct++;
    results.hottestInLast2.total++;

    // 6. 重复号优先，若无重复号则用上期最小号
    let p6 = null;
    if (intersectList.length > 0) {
      p6 = intersectList[0];
    } else {
      p6 = prevDraw1[0];
    }
    if (!currentDraw.includes(p6)) results.repeatPriority.correct++;
    results.repeatPriority.total++;
  }

  console.log('\n===================================================================================');
  console.log(`回测样本数：${testPeriods} 期 | 独立评估“在上两期范围内选一码排除”的各种规则`);
  console.log('===================================================================================');
  console.log('独立排除策略 (与公式无关)                       | 排除成功期数/总期数 | 排除成功概率');
  console.log('-----------------------------------------------------------------------------------');
  
  const printRow = (label, obj) => {
    const rate = ((obj.correct / obj.total) * 100).toFixed(2);
    const countStr = `${obj.correct}/${obj.total}`;
    console.log(`${label.padEnd(46)} | ${countStr.padStart(19)} | ${rate.padStart(11)}%`);
  };

  printRow('1. 排除上期开奖号的“最小号” (n1)', results.smallestLast1);
  printRow('2. 排除上期开奖号的“最大号” (n7)', results.largestLast1);
  printRow('3. 排除上期开奖号的“中位数” (n4)', results.medianLast1);
  printRow('4. 排除上两期开奖号里“历史最冷号”', results.coldestInLast2);
  printRow('5. 排除上两期开奖号里“历史最热号”', results.hottestInLast2);
  printRow('6. 排除上两期重复的重号 (若无重号则杀上期最小号)', results.repeatPriority);
  console.log('-----------------------------------------------------------------------------------');
  console.log('参考：纯随机排除任意一码的数学基准值 : 85.71%');
  console.log('===================================================================================\n');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

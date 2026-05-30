require('dotenv').config();
const mysql = require('mysql2/promise');

const MATH_RULES = [
  { id: 1, name: '首尾之和', fn: (d) => ((d[0] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 2, name: '首二之和', fn: (d) => ((d[0] + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 3, name: '末二之和', fn: (d) => ((d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 4, name: '首尾之差', fn: (d) => ((d[6] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 5, name: '首二之积', fn: (d) => ((d[0] * d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 6, name: '末二之积', fn: (d) => ((d[5] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 7, name: '奇数位相加', fn: (d) => ((d[0] + d[2] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 8, name: '偶数位相加', fn: (d) => ((d[1] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 9, name: '邻号差值调整', fn: (d) => ((d[6] - d[5] + 1 - 1) % 49 + 49) % 49 + 1 },
  { id: 10, name: '前二之差', fn: (d) => ((d[1] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 11, name: '首位倍增', fn: (d) => ((2 * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 12, name: '末位倍增', fn: (d) => ((2 * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 13, name: '首尾跨度差', fn: (d) => ((d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 14, name: '中首跨度差', fn: (d) => ((d[3] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 15, name: '核心中数和', fn: (d) => ((d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 16, name: '核心后数和', fn: (d) => ((d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 17, name: '三分位相加', fn: (d) => ((d[0] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 18, name: '尾三之差', fn: (d) => ((d[6] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 19, name: '五二之差', fn: (d) => ((d[4] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 20, name: '六三之差', fn: (d) => ((d[5] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 21, name: '五一之差', fn: (d) => ((d[4] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 22, name: '尾二之差', fn: (d) => ((d[6] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 23, name: '首位加权和', fn: (d) => ((d[0] * 3 + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 24, name: '末位加权和', fn: (d) => ((d[6] * 3 + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 25, name: '中位数倍增', fn: (d) => ((d[3] * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 26, name: '中数乘积A', fn: (d) => ((d[2] * d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 27, name: '中数乘积B', fn: (d) => ((d[1] * d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 28, name: '最大值平方', fn: (d) => ((d[6] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 29, name: '最小值平方', fn: (d) => ((d[0] * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 30, name: '中位数平方', fn: (d) => ((d[3] * d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 31, name: '前四和值', fn: (d) => ((d[0] + d[1] + d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 32, name: '后四和值', fn: (d) => ((d[3] + d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 33, name: '中间四和值', fn: (d) => ((d[1] + d[2] + d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 34, name: '首尾折中差', fn: (d) => ((d[0] + d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 35, name: '次级首尾差', fn: (d) => ((d[1] + d[5] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 36, name: '内包首尾差', fn: (d) => ((d[2] + d[4] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 37, name: '极值之积', fn: (d) => ((d[0] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 38, name: '前三和值', fn: (d) => ((d[0] + d[1] + d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 39, name: '后三和值', fn: (d) => ((d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 40, name: '首尾和倍增', fn: (d) => (((d[0] + d[6]) * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 41, name: '跨度倍增', fn: (d) => ((Math.abs(d[6] - d[0]) * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 42, name: '全总和模除', fn: (d) => ((d.reduce((a, b) => a + b, 0) - 1) % 49 + 49) % 49 + 1 },
  { id: 43, name: '极值均数', fn: (d) => ((Math.floor((d[0] + d[6]) / 2) - 1) % 49 + 49) % 49 + 1 },
  { id: 44, name: '三分之二倍数', fn: (d) => ((d[2] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 45, name: '三分之四倍数', fn: (d) => ((d[4] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 46, name: '跨度五倍数', fn: (d) => (((d[6] - d[0]) * 5 - 1) % 49 + 49) % 49 + 1 },
  { id: 47, name: '奇特三和', fn: (d) => ((d[0] + d[2] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 48, name: '中枢奇和', fn: (d) => ((d[0] + d[4] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 49, name: '中枢偶和', fn: (d) => ((d[1] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 50, name: '次级混合和', fn: (d) => ((d[0] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 }
];

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
    return {
      year: Number(r.year),
      No: Number(r.No),
      numbers: arr
    };
  });

  const windowSize = 100;
  const targetPeriods = [140, 141, 147, 148, 149];
  const targetYear = 2026;

  console.log(`Analyzing consecutive error periods in year ${targetYear}...`);

  for (const targetNo of targetPeriods) {
    const i = history.findIndex(h => h.year === targetYear && h.No === targetNo);
    if (i === -1) {
      console.log(`Period ${targetNo} not found in database for year ${targetYear}.`);
      continue;
    }

    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - windowSize;

    // 1. 各个公式在之前 100 期的胜率
    const stats = MATH_RULES.map((rule) => {
      let successCount = 0;
      let totalCount = 0;

      for (let j = startIdx; j < i; j++) {
        const pD = history[j - 1]?.numbers;
        const cD = history[j]?.numbers;
        if (pD && cD) {
          const predicted = rule.fn(pD);
          if (!cD.includes(predicted)) {
            successCount++;
          }
          totalCount++;
        }
      }

      const accuracy = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
      const pred = rule.fn(prevDraw.numbers);

      return {
        ...rule,
        accuracy,
        pred
      };
    });

    // 2. 投票
    const targetThreshold = 95;
    const votingThreshold = targetThreshold - 3; // 92%
    let qualifiedRules = stats.filter((r) => r.accuracy >= votingThreshold);
    
    if (qualifiedRules.length < 15) {
      const sortedStats = [...stats].sort((a, b) => b.accuracy - a.accuracy);
      qualifiedRules = sortedStats.slice(0, 25);
    }

    const votesMap = {};
    for (let num = 1; num <= 49; num++) {
      votesMap[num] = { num, count: 0, votingRules: [] };
    }

    for (const rule of qualifiedRules) {
      const pred = rule.pred;
      if (pred && pred >= 1 && pred <= 49) {
        votesMap[pred].count++;
        votesMap[pred].votingRules.push(rule);
      }
    }

    const rankedNumbers = Object.values(votesMap).filter((item) => item.count > 0);
    rankedNumbers.sort((a, b) => b.count - a.count || a.num - b.num);

    // 取前 3 个
    const selectedPredictions = [];
    const usedPreds = new Set();
    for (let k = 0; k < 3; k++) {
      if (rankedNumbers[k]) {
        const item = rankedNumbers[k];
        selectedPredictions.push({
          num: item.num,
          votes: item.count,
          votingRules: item.votingRules
        });
        usedPreds.add(item.num);
      }
    }

    // 兜底补齐
    if (selectedPredictions.length < 3) {
      const sortedStats = [...stats].sort((a, b) => b.accuracy - a.accuracy || a.id - b.id);
      for (const ruleStat of sortedStats) {
        if (selectedPredictions.length >= 3) break;
        const num = ruleStat.pred;
        if (num && !usedPreds.has(num)) {
          usedPreds.add(num);
          selectedPredictions.push({
            num,
            votes: 1,
            votingRules: [ruleStat]
          });
        }
      }
    }

    console.log(`\n========================================================================`);
    console.log(`【${currentDraw.year}年 第 ${currentDraw.No} 期】`);
    console.log(`上期开奖号: [${prevDraw.numbers.map(n => String(n).padStart(2, '0')).join(', ')}]`);
    console.log(`当期开奖号: [${currentDraw.numbers.map(n => String(n).padStart(2, '0')).join(', ')}]`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`3码排除预测结果:`);

    selectedPredictions.forEach((p, idx) => {
      const isFailed = currentDraw.numbers.includes(p.num);
      const mark = isFailed ? '🔴 [误杀 - 排除失败!]' : '🟢 [成功 - 正确排除]';
      console.log(`  #${idx+1}: 排除号 ${String(p.num).padStart(2, '0')} | 得票: ${p.votes} 票 | ${mark}`);
      if (isFailed) {
        console.log(`     -> 投票的公式有:`);
        p.votingRules.forEach(r => {
          console.log(`        - ${r.name.padEnd(10)} (该公式前100期胜率: ${r.accuracy.toFixed(1)}%)`);
        });
      }
    });
  }

  console.log(`========================================================================\n`);

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

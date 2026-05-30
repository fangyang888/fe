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
    return arr;
  });

  const windowSize = 100;
  const testPeriods = 300;
  const N = history.length;

  // 动态测试各种阈值组合，进行网格搜索
  const grid = [];
  for (let minV = 1; minV <= 3; minV++) {
    for (let sumV = 3; sumV <= 10; sumV++) {
      for (let minAcc = 84; minAcc <= 91; minAcc++) {
        grid.push({
          minV,
          sumV,
          minAcc,
          total: 0,
          predicted: 0,
          allCorrect: 0
        });
      }
    }
  }

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - windowSize;

    const stats = MATH_RULES.map((rule) => {
      let successCount = 0;
      let totalCount = 0;

      for (let j = startIdx; j < i; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (pD && cD) {
          const predicted = rule.fn(pD);
          if (!cD.includes(predicted)) {
            successCount++;
          }
          totalCount++;
        }
      }

      const accuracy = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
      const pred = rule.fn(prevDraw);

      return {
        ...rule,
        accuracy,
        pred
      };
    });

    const targetThreshold = 95;
    const votingThreshold = targetThreshold - 3; // 92%
    let qualifiedRules = stats.filter((r) => r.accuracy >= votingThreshold);
    
    if (qualifiedRules.length < 15) {
      const sortedStats = [...stats].sort((a, b) => b.accuracy - a.accuracy);
      qualifiedRules = sortedStats.slice(0, 25);
    }

    const votesMap = {};
    for (let num = 1; num <= 49; num++) {
      votesMap[num] = { num, count: 0, totalAccuracy: 0 };
    }

    for (const rule of qualifiedRules) {
      const pred = rule.pred;
      if (pred && pred >= 1 && pred <= 49) {
        votesMap[pred].count++;
        votesMap[pred].totalAccuracy += rule.accuracy;
      }
    }

    const rankedNumbers = Object.values(votesMap).filter((item) => item.count > 0);
    rankedNumbers.sort((a, b) => b.count - a.count || (b.totalAccuracy / b.count) - (a.totalAccuracy / a.count) || a.num - b.num);

    const selectedPredictions = [];
    const usedPreds = new Set();

    for (let k = 0; k < 3; k++) {
      if (rankedNumbers[k]) {
        const item = rankedNumbers[k];
        selectedPredictions.push({
          num: item.num,
          votes: item.count,
          accuracy: item.count > 0 ? item.totalAccuracy / item.count : 0
        });
        usedPreds.add(item.num);
      }
    }

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
            accuracy: ruleStat.accuracy
          });
        }
      }
    }

    // 评估所有网格节点
    const allCorrect = selectedPredictions.filter(p => currentDraw.includes(p.num)).length === 0;

    for (const node of grid) {
      node.total++;
      
      const passMinV = selectedPredictions.every(p => p.votes >= node.minV);
      const passSumV = selectedPredictions.reduce((sum, p) => sum + p.votes, 0) >= node.sumV;
      const passAcc = (selectedPredictions.reduce((sum, p) => sum + p.accuracy, 0) / 3) >= node.minAcc;

      if (passMinV && passSumV && passAcc) {
        node.predicted++;
        if (allCorrect) {
          node.allCorrect++;
        }
      }
    }
  }

  // 排序找出排除全对概率最高的，且预测期数不能太少 (比如至少预测 30 期，即有 10% 的出奖率)
  const filteredNodes = grid.filter(node => node.predicted >= 30);
  filteredNodes.sort((a, b) => {
    const rateA = a.allCorrect / a.predicted;
    const rateB = b.allCorrect / b.predicted;
    return rateB - rateA || b.predicted - a.predicted;
  });

  console.log('\n========================================================================');
  console.log('网格搜索结果：全对概率最高的前 10 个配置 (要求至少预测 30 期)');
  console.log('========================================================================');
  console.log('配置条件                              | 预测期数/总期数  | 空仓率   | 排除全对概率');
  console.log('------------------------------------------------------------------------');
  
  for (let idx = 0; idx < Math.min(10, filteredNodes.length); idx++) {
    const node = filteredNodes[idx];
    const predRate = ((node.predicted / node.total) * 100).toFixed(1);
    const skipRate = (100 - predRate).toFixed(1);
    const allCorrectRate = ((node.allCorrect / node.predicted) * 100).toFixed(2);
    const condStr = `MinV>=${node.minV}, SumV>=${node.sumV}, Acc>=${node.minAcc}%`;
    const countStr = `${node.predicted}/${node.total}`;
    console.log(
      `${condStr.padEnd(37)} | ${countStr.padStart(15)} | ${skipRate.padStart(6)}% | ${allCorrectRate.padStart(11)}%`
    );
  }
  console.log('========================================================================');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

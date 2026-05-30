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

  let stats = {
    consensus: { allCorrect: 0, total: 0 },
    diversityConsensus: { allCorrect: 0, total: 0 }
  };

  const targetThreshold = 95;
  const votingThreshold = targetThreshold - 3; // 92%

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - 1 - windowSize;

    // 运行各公式胜率回测
    const statsList = MATH_RULES.map(rule => {
      let sc = 0, tc = 0;
      for (let j = startIdx; j < i - 1; j++) {
        if (!history[j].includes(rule.fn(history[j - 1]))) sc++;
        tc++;
      }
      return { pred: rule.fn(prevDraw), accuracy: tc > 0 ? (sc / tc) * 100 : 0 };
    });

    // 筛选投票公式
    let qualified = statsList.filter(r => r.accuracy >= votingThreshold);
    if (qualified.length < 15) {
      statsList.sort((a, b) => b.accuracy - a.accuracy);
      qualified = statsList.slice(0, 25);
    }

    // 计票
    const votes = new Array(50).fill(0);
    qualified.forEach(q => votes[q.pred]++);

    const rankedCandidates = [];
    for (let num = 1; num <= 49; num++) {
      if (votes[num] > 0) {
        rankedCandidates.push({ num, votes: votes[num] });
      }
    }
    rankedCandidates.sort((a, b) => b.votes - a.votes || a.num - b.num);

    // 1. 常规共识投票：直接选得票最高的前3个号码
    const predsConsensus = rankedCandidates.slice(0, 3).map(x => x.num);
    const failedConsensus = predsConsensus.filter(p => currentDraw.includes(p));

    // 2. 约束多样性共识投票 (Diversity Constrained)：
    // 从得票最高的前 6 个号码中，挑选满足以下约束的 3 个号码：
    // - 奇偶分布：不能全是奇数或全是偶数
    // - 三区分布：落在不同的区间 (1-16, 17-32, 33-49)
    // 如果找不到，则回退为常规共识投票的前3个。
    const pool = rankedCandidates.slice(0, 6).map(x => x.num);
    let predsDiversity = [];

    // 寻找最佳组合
    let found = false;
    for (let c1 = 0; c1 < pool.length; c1++) {
      for (let c2 = c1 + 1; c2 < pool.length; c2++) {
        for (let c3 = c2 + 1; c3 < pool.length; c3++) {
          const n1 = pool[c1], n2 = pool[c2], n3 = pool[c3];
          
          // 奇偶性检验
          const odds = [n1, n2, n3].filter(n => n % 2 === 1).length;
          if (odds === 0 || odds === 3) continue; // 排除全奇或全偶

          // 区间检验：1-16, 17-32, 33-49
          const getZone = (n) => (n <= 16 ? 1 : n <= 32 ? 2 : 3);
          const z1 = getZone(n1), z2 = getZone(n2), z3 = getZone(n3);
          if (z1 === z2 || z2 === z3 || z1 === z3) continue; // 必须分布在3个不同的区间

          predsDiversity = [n1, n2, n3];
          found = true;
          break;
        }
        if (found) break;
      }
      if (found) break;
    }

    // 兜底
    if (!found) {
      predsDiversity = predsConsensus;
    }

    const failedDiversity = predsDiversity.filter(p => currentDraw.includes(p));

    stats.consensus.total++;
    if (failedConsensus.length === 0) stats.consensus.allCorrect++;

    stats.diversityConsensus.total++;
    if (failedDiversity.length === 0) stats.diversityConsensus.allCorrect++;
  }

  const consensusRate = ((stats.consensus.allCorrect / stats.consensus.total) * 100).toFixed(2);
  const divRate = ((stats.diversityConsensus.allCorrect / stats.diversityConsensus.total) * 100).toFixed(2);

  console.log('\n======================================================');
  console.log(`回测样本数：${testPeriods} 期 | 历史窗口：${windowSize} 期`);
  console.log('======================================================');
  console.log(`1. 常规共识投票 (Consensus) 全对率:       ${consensusRate}%`);
  console.log(`2. 约束多样性共识投票 (Diversity) 全对率:  ${divRate}%`);
  console.log(`相对提升: ${(divRate - consensusRate).toFixed(2)}%`);
  console.log('======================================================');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

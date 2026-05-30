require('dotenv').config();
const mysql = require('mysql2/promise');

// 50个数学公式
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

  // 获取所有历史数据
  const [rows] = await connection.execute(
    'SELECT n1, n2, n3, n4, n5, n6, n7, year, No FROM history ORDER BY year ASC, No ASC'
  );
  
  if (rows.length < 110) {
    console.error(`数据量太小 (${rows.length})，无法进行有效的回测！`);
    await connection.end();
    return;
  }

  const history = rows.map(r => {
    const arr = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number);
    arr.sort((a, b) => a - b);
    return arr;
  });

  console.log(`Loaded ${history.length} draws from database. Starting backtest simulation...`);

  const windowSize = 100; // 回测使用的窗口期数
  const testPeriods = 300; // 测试最近的 300 期结果
  const N = history.length;
  
  let stats = {
    baseline: { allCorrect: 0, singleCorrect: 0, total: 0 },
    consensus: { allCorrect: 0, singleCorrect: 0, total: 0 },
    consensusAndFilters: { allCorrect: 0, singleCorrect: 0, total: 0 },
    lowCVAndConsensus: { allCorrect: 0, singleCorrect: 0, total: 0 }
  };

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];

    // 1. 在 i-1 时刻，计算前 windowSize 期的各公式胜率
    const startIdx = i - 1 - windowSize;
    const ruleAccList = MATH_RULES.map(rule => {
      let sc = 0, tc = 0;
      for (let j = startIdx; j < i - 1; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (!cD.includes(rule.fn(pD))) sc++;
        tc++;
      }
      const acc = tc > 0 ? (sc / tc) * 100 : 0;
      const pred = rule.fn(prevDraw);
      return { rule, accuracy: acc, pred };
    });

    // 2. 基准策略 (Baseline)：直接取胜率前3个不重复预测号
    ruleAccList.sort((a, b) => b.accuracy - a.accuracy || a.rule.id - b.rule.id);
    const baselinePreds = [];
    const baselineUsed = new Set();
    for (const item of ruleAccList) {
      if (baselinePreds.length >= 3) break;
      if (!baselineUsed.has(item.pred)) {
        baselineUsed.add(item.pred);
        baselinePreds.push(item.pred);
      }
    }

    // 3. 策略A：公式共识投票 (Consensus Voting)
    // 找出所有胜率 > 92% 的公式，给他们的预测号码投票，选得票最高的前3个号码
    const votes = new Array(50).fill(0);
    const qualifiedRules = ruleAccList.filter(item => item.accuracy >= 92);
    // 兜底：如果少于15个公式胜率符合，直接取前25个公式投票
    const votingRules = qualifiedRules.length >= 15 ? qualifiedRules : ruleAccList.slice(0, 25);
    for (const item of votingRules) {
      votes[item.pred]++;
    }
    const rankedVotes = [];
    for (let num = 1; num <= 49; num++) {
      if (votes[num] > 0) {
        rankedVotes.push({ num, votes: votes[num] });
      }
    }
    rankedVotes.sort((a, b) => b.votes - a.votes || a.num - b.num);
    const consensusPreds = rankedVotes.slice(0, 3).map(x => x.num);
    // 兜底：若得票数不够3个，从基准策略补充
    while (consensusPreds.length < 3) {
      const extra = baselinePreds.find(p => !consensusPreds.includes(p));
      if (extra) consensusPreds.push(extra);
      else break;
    }

    // 4. 策略B：共识投票 + 热号与遗漏风控过滤器
    // 计算前几期的号码出现频次，避免排除“极热号”与“极限冷号”
    // 热号过滤：过去5期出现2次及以上的号码
    const hotNumbers = new Set();
    const freq5 = new Array(50).fill(0);
    for (let j = i - 5; j < i; j++) {
      history[j].forEach(n => freq5[n]++);
    }
    for (let n = 1; n <= 49; n++) {
      if (freq5[n] >= 2) hotNumbers.add(n);
    }
    // 极限冷号过滤：当前遗漏大于 25 期的号
    const coldNumbers = new Set();
    for (let n = 1; n <= 49; n++) {
      let lastAppear = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (history[j].includes(n)) {
          lastAppear = j;
          break;
        }
      }
      if (lastAppear === -1 || (i - 1 - lastAppear) > 25) {
        coldNumbers.add(n);
      }
    }

    const consensusFilterPreds = [];
    for (const rv of rankedVotes) {
      if (consensusFilterPreds.length >= 3) break;
      // 过滤热号和超冷号
      if (hotNumbers.has(rv.num) || coldNumbers.has(rv.num)) continue;
      consensusFilterPreds.push(rv.num);
    }
    while (consensusFilterPreds.length < 3) {
      const extra = consensusPreds.find(p => !consensusFilterPreds.includes(p));
      if (extra) consensusFilterPreds.push(extra);
      else break;
    }

    // 5. 策略C：上期低CV号码强杀 + 共识投票补齐
    // 根据上一期开奖7个号，挑选其历史上CV最低的2个号（遗漏规律性极强），因为它们连出的概率极低。
    // 这两个号作为强杀（杀号准确率高），再通过共识投票补齐第3个号。
    const lastDraw = history[i - 1];
    const cvScores = lastDraw.map(n => {
      const appearances = [];
      for (let j = 0; j < i; j++) {
        if (history[j].includes(n)) appearances.push(j);
      }
      if (appearances.length < 2) return { n, cv: 2.0 };
      const gaps = [];
      for (let k = 1; k < appearances.length; k++) {
        gaps.push(appearances[k] - appearances[k - 1]);
      }
      const avg = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avg) ** 2, 0) / gaps.length);
      return { n, cv: avg > 0 ? stdDev / avg : 2.0 };
    });
    cvScores.sort((a, b) => a.cv - b.cv);
    const lowCVKills = cvScores.slice(0, 2).map(x => x.n);
    const lowCVPreds = [...lowCVKills];
    // 补齐第3个号
    for (const rv of rankedVotes) {
      if (lowCVPreds.length >= 3) break;
      if (!lowCVPreds.includes(rv.num)) {
        lowCVPreds.push(rv.num);
      }
    }

    // 评估这四种策略在当期 currentDraw 的准确性
    const evalStrategy = (preds, key) => {
      const failed = preds.filter(p => currentDraw.includes(p));
      const isAllCorrect = failed.length === 0;
      const correctCount = preds.length - failed.length;
      
      stats[key].total++;
      if (isAllCorrect) stats[key].allCorrect++;
      stats[key].singleCorrect += correctCount;
    };

    evalStrategy(baselinePreds, 'baseline');
    evalStrategy(consensusPreds, 'consensus');
    evalStrategy(consensusFilterPreds, 'consensusAndFilters');
    evalStrategy(lowCVPreds, 'lowCVAndConsensus');
  }

  // 打印输出对比表
  console.log('\n======================================================');
  console.log(`回测样本期数：${testPeriods} 期 | 规律学习历史窗口：${windowSize} 期`);
  console.log('======================================================');
  console.log('策略方案                      | 单码杀对率 | 3码全对率 (全中排除)');
  console.log('------------------------------------------------------');
  
  const printRow = (name, key) => {
    const s = stats[key];
    const singleRate = ((s.singleCorrect / (s.total * 3)) * 100).toFixed(2);
    const allCorrectRate = ((s.allCorrect / s.total) * 100).toFixed(2);
    console.log(`${name.padEnd(28)} | ${singleRate.padStart(8)}% | ${allCorrectRate.padStart(12)}%`);
  };

  printRow('1. 基础单公式前3 (Baseline)', 'baseline');
  printRow('2. 高置信公式共识投票 (Consensus)', 'consensus');
  printRow('3. 共识投票 + 冷热避杀过滤', 'consensusAndFilters');
  printRow('4. 上期低CV强杀 + 共识投票补齐', 'lowCVAndConsensus');
  console.log('======================================================');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

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

// --- AI Models in JS ---
function getMarkovProbs(subHist) {
  if (subHist.length < 2) return Array(50).fill(0);
  const matrix = Array(50).fill(0).map(() => Array(50).fill(0));
  const counts = Array(50).fill(0);

  for (let i = 0; i < subHist.length - 1; i++) {
    const current = subHist[i];
    const next = subHist[i + 1];
    for (const n1 of current) {
      counts[n1]++;
      for (const n2 of next) {
        matrix[n1][n2]++;
      }
    }
  }

  for (let i = 1; i <= 49; i++) {
    if (counts[i] > 0) {
      for (let j = 1; j <= 49; j++) {
        matrix[i][j] = matrix[i][j] / counts[i];
      }
    }
  }

  const lastRow = subHist[subHist.length - 1];
  const nextProbs = Array(50).fill(0);
  for (let j = 1; j <= 49; j++) {
    let probSum = 0;
    for (const n1 of lastRow) {
      probSum += matrix[n1][j];
    }
    nextProbs[j] = probSum / lastRow.length;
  }
  return nextProbs;
}

function getKnnProbs(subHist, k = 20) {
  if (subHist.length < 10) return new Array(50).fill(0);
  const pattern = [
    new Set(subHist[subHist.length - 3]),
    new Set(subHist[subHist.length - 2]),
    new Set(subHist[subHist.length - 1]),
  ];

  const similarities = [];
  for (let i = 2; i < subHist.length - 1; i++) {
    if (i >= subHist.length - 3) continue;

    let sim = 0;
    for (let j = 0; j < 3; j++) {
      const histSet = subHist[i - 2 + j];
      const patSet = pattern[j];
      let intersection = 0;
      for (const num of histSet) {
        if (patSet.has(num)) intersection++;
      }
      const weights = [0.2, 0.3, 0.5];
      sim += intersection * weights[j];
    }
    similarities.push({ index: i, sim });
  }

  similarities.sort((a, b) => b.sim - a.sim);
  const topK = similarities.slice(0, k);

  const nextFrequencies = new Array(50).fill(0);
  for (const neighbor of topK) {
    const nextRow = subHist[neighbor.index + 1];
    for (const num of nextRow) {
      nextFrequencies[num]++;
    }
  }

  const knnProbs = new Array(50).fill(0);
  for (let i = 1; i <= 49; i++) {
    knnProbs[i] = nextFrequencies[i] / k;
  }
  return knnProbs;
}

function getBayesKillProbs(subHist) {
  if (subHist.length < 50) return new Array(50).fill(0);

  let classKill = 0;
  let classNotKill = 0;

  const countF1 = { kill: new Array(5).fill(0.1), notKill: new Array(5).fill(0.1) };
  const countF2 = { kill: new Array(4).fill(0.1), notKill: new Array(4).fill(0.1) };
  const countF3 = { kill: new Array(10).fill(0.1), notKill: new Array(10).fill(0.1) };
  const countF4 = { kill: new Array(2).fill(0.1), notKill: new Array(2).fill(0.1) };

  const getF1Category = (gap) => gap === 0 ? 0 : gap <= 2 ? 1 : gap <= 5 ? 2 : gap <= 10 ? 3 : 4;
  const getF2Category = (freq) => freq === 0 ? 0 : freq === 1 ? 1 : freq === 2 ? 2 : 3;
  const getF3Category = (n) => n % 10;
  const getF4Category = (n) => n % 2;

  const lastSeen = new Array(50).fill(-1);

  for (let i = 0; i < subHist.length - 1; i++) {
    const row = subHist[i];
    for (let n = 1; n <= 49; n++) {
      let freq = 0;
      for (let j = Math.max(0, i - 9); j <= i; j++) {
        if (subHist[j].includes(n)) freq++;
      }

      const gap = lastSeen[n] === -1 ? 10 : i - lastSeen[n];
      const f1 = getF1Category(gap);
      const f2 = getF2Category(freq);
      const f3 = getF3Category(n);
      const f4 = getF4Category(n);

      const isKilled = !subHist[i + 1].includes(n);
      if (isKilled) {
        classKill++;
        countF1.kill[f1]++;
        countF2.kill[f2]++;
        countF3.kill[f3]++;
        countF4.kill[f4]++;
      } else {
        classNotKill++;
        countF1.notKill[f1]++;
        countF2.notKill[f2]++;
        countF3.notKill[f3]++;
        countF4.notKill[f4]++;
      }
    }
    for (const num of row) lastSeen[num] = i;
  }

  const currentGap = new Array(50).fill(10);
  const currentFreq = new Array(50).fill(0);
  for (let n = 1; n <= 49; n++) {
    let freq = 0;
    for (let j = Math.max(0, subHist.length - 10); j < subHist.length; j++) {
      if (subHist[j].includes(n)) freq++;
    }
    currentFreq[n] = freq;

    let ls = -1;
    for (let j = subHist.length - 1; j >= 0; j--) {
      if (subHist[j].includes(n)) {
        ls = j;
        break;
      }
    }
    currentGap[n] = ls === -1 ? 10 : subHist.length - 1 - ls;
  }

  const pKill = classKill / (classKill + classNotKill);
  const pNotKill = classNotKill / (classKill + classNotKill);
  const mlProbs = new Array(50).fill(0);

  for (let n = 1; n <= 49; n++) {
    const f1 = getF1Category(currentGap[n]);
    const f2 = getF2Category(currentFreq[n]);
    const f3 = getF3Category(n);
    const f4 = getF4Category(n);

    const scoreKill = pKill * (countF1.kill[f1]/classKill) * (countF2.kill[f2]/classKill) * (countF3.kill[f3]/classKill) * (countF4.kill[f4]/classKill);
    const scoreNotKill = pNotKill * (countF1.notKill[f1]/classNotKill) * (countF2.notKill[f2]/classNotKill) * (countF3.notKill[f3]/classNotKill) * (countF4.notKill[f4]/classNotKill);

    mlProbs[n] = scoreKill / (scoreKill + scoreNotKill);
  }

  return mlProbs;
}


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

  const stats = {
    baseline: { correct: 0, total: 300 },
    
    // AI 联合过滤器 (Ensemble filter): 过滤掉 Markov 概率高（极热/极易反弹）的推荐排除号
    ai_markov_veto: { correct: 0, total: 300 },
    
    // AI 置信度交叉校验 (AI Joint Confidence Breaker): 仅当 KNN/Bayes/Markov 融合概率表明非常安全时，才进行预测，否则熔断空仓
    ai_joint_cb: { correct: 0, total: 0, skipped: 0 },
    
    // 排除一码 (Exclude-1) + AI 联合过滤
    exclude1_baseline: { correct: 0, total: 300 },
    exclude1_ai_markov_veto: { correct: 0, total: 300 },
    exclude1_ai_joint_cb: { correct: 0, total: 0, skipped: 0 }
  };

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - windowSize;
    const subHist = history.slice(0, i);

    // 1. 各个公式在之前 100 期的胜率与最新预测
    const rulesStats = MATH_RULES.map((rule) => {
      let successCount = 0;
      let totalCount = 0;

      for (let j = startIdx; j < i; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (pD && cD) {
          const predicted = rule.fn(pD);
          if (!cD.includes(predicted)) successCount++;
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

    // 2. 提取 AI 预测值 (在 i 期之前的数据)
    const markovProbs = getMarkovProbs(subHist);
    const knnProbs = getKnnProbs(subHist, 20);
    const bayesKillProbs = getBayesKillProbs(subHist);

    // 3. 构建公式共识计票
    const getConsensusList = (vetoMarkov = false, maxMarkovProb = 0.20) => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3; // 92%
      let qualifiedRules = rulesStats.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 15) {
        qualifiedRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 25);
      }

      const votesMap = {};
      for (let num = 1; num <= 49; num++) {
        votesMap[num] = { num, count: 0, totalAccuracy: 0 };
      }

      for (const r of qualifiedRules) {
        // 如果启用马尔可夫过滤，则把马尔可夫预测出现概率高于阈值的号码剔除（不允许被排除/杀死）
        if (vetoMarkov && markovProbs[r.pred] >= maxMarkovProb) {
          continue; 
        }
        votesMap[r.pred].count++;
        votesMap[r.pred].totalAccuracy += r.accuracy;
      }

      const ranked = Object.values(votesMap).filter(v => v.count > 0);
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);
      return ranked;
    };

    const getFinalPreds = (ranked, count) => {
      const preds = [];
      const used = new Set();
      for (let k = 0; k < count; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      // 兜底
      if (preds.length < count) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= count) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // --- 排除三码评估 ---
    // Baseline
    const baselineRanked = getConsensusList(false);
    const baselinePreds = getFinalPreds(baselineRanked, 3);
    if (baselinePreds.filter(p => currentDraw.includes(p)).length === 0) stats.baseline.correct++;

    // AI Markov Veto (过滤掉下期高概率开出号)
    const vetoRanked = getConsensusList(true, 0.22);
    const vetoPreds = getFinalPreds(vetoRanked, 3);
    if (vetoPreds.filter(p => currentDraw.includes(p)).length === 0) stats.ai_markov_veto.correct++;

    // AI Joint Confidence Breaker
    // 综合评估杀号风险分：如果 3 个选出号的 AI 平均开出概率较高，则空仓
    // AI_Risk_Score = KNN出现率 + Markov出现率 + (1 - NaiveBayes排除率)
    const getAIRisk = (num) => {
      return (knnProbs[num] + markovProbs[num] + (1 - bayesKillProbs[num])) / 3;
    };

    const threeRisk = vetoPreds.reduce((sum, p) => sum + getAIRisk(p), 0) / 3;
    // 门槛要求综合风险必须极低（如平均风险 <= 0.16）才投注，否则触发熔断空仓
    if (threeRisk <= 0.16) {
      stats.ai_joint_cb.total++;
      if (vetoPreds.filter(p => currentDraw.includes(p)).length === 0) {
        stats.ai_joint_cb.correct++;
      }
    } else {
      stats.ai_joint_cb.skipped++;
    }

    // --- 排除一码评估 ---
    const exclude1_b = getFinalPreds(baselineRanked, 1);
    if (!currentDraw.includes(exclude1_b[0])) stats.exclude1_baseline.correct++;

    const exclude1_v = getFinalPreds(vetoRanked, 1);
    if (!currentDraw.includes(exclude1_v[0])) stats.exclude1_ai_markov_veto.correct++;

    const oneRisk = getAIRisk(exclude1_v[0]);
    // 排除一码，要求风险值 <= 0.14 才预测，否则空仓
    if (oneRisk <= 0.14) {
      stats.exclude1_ai_joint_cb.total++;
      if (!currentDraw.includes(exclude1_v[0])) {
        stats.exclude1_ai_joint_cb.correct++;
      }
    } else {
      stats.exclude1_ai_joint_cb.skipped++;
    }
  }

  // 打印输出对比表
  console.log('\n===================================================================================');
  console.log(`回测样本数：${testPeriods} 期 | 历史滑动窗口：${windowSize} 期`);
  console.log('===================================================================================');
  console.log('算法融合方案 (Method 3)                       | 预测期数/总期数 | 空仓率  | 排除全对概率');
  console.log('-----------------------------------------------------------------------------------');
  
  const printRow = (label, obj) => {
    const total = obj.total !== undefined ? obj.total : 300;
    const skipped = obj.skipped !== undefined ? obj.skipped : 0;
    const rate = total > 0 ? ((obj.correct / total) * 100).toFixed(2) : '0.00';
    const skipRate = ((skipped / 300) * 100).toFixed(1) + '%';
    const countStr = `${obj.correct}/${total}`;
    console.log(`${label.padEnd(45)} | ${countStr.padStart(15)} | ${skipRate.padStart(6)} | ${rate.padStart(11)}%`);
  };

  printRow('排除三码 Baseline (纯公式共识)', stats.baseline);
  printRow('排除三码 + AI 强排斥过滤 (Markov 过滤)', stats.ai_markov_veto);
  printRow('排除三码 + AI 强排斥 + 熔断 (AI 综合评分)', stats.ai_joint_cb);
  console.log('-----------------------------------------------------------------------------------');
  printRow('排除一码 Baseline (纯公式杀一)', stats.exclude1_baseline);
  printRow('排除一码 + AI 强排斥过滤 (Markov 过滤)', stats.exclude1_ai_markov_veto);
  printRow('排除一码 + AI 强排斥 + 熔断 (AI 综合评分)', stats.exclude1_ai_joint_cb);
  console.log('===================================================================================\n');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

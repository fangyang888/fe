require('dotenv').config();
const mysql = require('mysql2/promise');

const MATH_RULES = [
  { id: 1, name: '首尾之和', category: 'sum', fn: (d) => ((d[0] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 2, name: '首二之和', category: 'sum', fn: (d) => ((d[0] + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 3, name: '末二之和', category: 'sum', fn: (d) => ((d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 4, name: '首尾之差', category: 'diff', fn: (d) => ((d[6] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 5, name: '首二之积', category: 'prod', fn: (d) => ((d[0] * d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 6, name: '末二之积', category: 'prod', fn: (d) => ((d[5] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 7, name: '奇数位相加', category: 'sum', fn: (d) => ((d[0] + d[2] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 8, name: '偶数位相加', category: 'sum', fn: (d) => ((d[1] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 9, name: '邻号差值调整', category: 'diff', fn: (d) => ((d[6] - d[5] + 1 - 1) % 49 + 49) % 49 + 1 },
  { id: 10, name: '前二之差', category: 'diff', fn: (d) => ((d[1] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 11, name: '首位倍增', category: 'prod', fn: (d) => ((2 * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 12, name: '末位倍增', category: 'prod', fn: (d) => ((2 * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 13, name: '首尾跨度差', category: 'diff', fn: (d) => ((d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 14, name: '中首跨度差', category: 'diff', fn: (d) => ((d[3] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 15, name: '核心中数和', category: 'sum', fn: (d) => ((d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 16, name: '核心后数和', category: 'sum', fn: (d) => ((d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 17, name: '三分位相加', category: 'sum', fn: (d) => ((d[0] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 18, name: '尾三之差', category: 'diff', fn: (d) => ((d[6] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 19, name: '五二之差', category: 'diff', fn: (d) => ((d[4] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 20, name: '六三之差', category: 'diff', fn: (d) => ((d[5] - d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 21, name: '五一之差', category: 'diff', fn: (d) => ((d[4] - d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 22, name: '尾二之差', category: 'diff', fn: (d) => ((d[6] - d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 23, name: '首位加权和', category: 'sum', fn: (d) => ((d[0] * 3 + d[1] - 1) % 49 + 49) % 49 + 1 },
  { id: 24, name: '末位加权和', category: 'sum', fn: (d) => ((d[6] * 3 + d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 25, name: '中位数倍增', category: 'prod', fn: (d) => ((d[3] * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 26, name: '中数乘积A', category: 'prod', fn: (d) => ((d[2] * d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 27, name: '中数乘积B', category: 'prod', fn: (d) => ((d[1] * d[5] - 1) % 49 + 49) % 49 + 1 },
  { id: 28, name: '最大值平方', category: 'prod', fn: (d) => ((d[6] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 29, name: '最小值平方', category: 'prod', fn: (d) => ((d[0] * d[0] - 1) % 49 + 49) % 49 + 1 },
  { id: 30, name: '中位数平方', category: 'prod', fn: (d) => ((d[3] * d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 31, name: '前四和值', category: 'sum', fn: (d) => ((d[0] + d[1] + d[2] + d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 32, name: '后四和值', category: 'sum', fn: (d) => ((d[3] + d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 33, name: '中间四和值', category: 'sum', fn: (d) => ((d[1] + d[2] + d[3] + d[4] - 1) % 49 + 49) % 49 + 1 },
  { id: 34, name: '首尾折中差', category: 'diff', fn: (d) => ((d[0] + d[6] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 35, name: '次级首尾差', category: 'diff', fn: (d) => ((d[1] + d[5] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 36, name: '内包首尾差', category: 'diff', fn: (d) => ((d[2] + d[4] - d[3] - 1) % 49 + 49) % 49 + 1 },
  { id: 37, name: '极值之积', category: 'prod', fn: (d) => ((d[0] * d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 38, name: '前三和值', category: 'sum', fn: (d) => ((d[0] + d[1] + d[2] - 1) % 49 + 49) % 49 + 1 },
  { id: 39, name: '后三和值', category: 'sum', fn: (d) => ((d[4] + d[5] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 40, name: '首尾和倍增', category: 'sum', fn: (d) => (((d[0] + d[6]) * 2 - 1) % 49 + 49) % 49 + 1 },
  { id: 41, name: '跨度倍增', category: 'diff', fn: (d) => ((Math.abs(d[6] - d[0]) * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 42, name: '全总和模除', category: 'sum', fn: (d) => ((d.reduce((a, b) => a + b, 0) - 1) % 49 + 49) % 49 + 1 },
  { id: 43, name: '极值均数', category: 'diff', fn: (d) => ((Math.floor((d[0] + d[6]) / 2) - 1) % 49 + 49) % 49 + 1 },
  { id: 44, name: '三分之二倍数', category: 'prod', fn: (d) => ((d[2] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 45, name: '三分之四倍数', category: 'prod', fn: (d) => ((d[4] * 3 - 1) % 49 + 49) % 49 + 1 },
  { id: 46, name: '跨度五倍数', category: 'diff', fn: (d) => (((d[6] - d[0]) * 5 - 1) % 49 + 49) % 49 + 1 },
  { id: 47, name: '奇特三和', category: 'sum', fn: (d) => ((d[0] + d[2] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 48, name: '中枢奇和', category: 'sum', fn: (d) => ((d[0] + d[4] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 49, name: '中枢偶和', category: 'sum', fn: (d) => ((d[1] + d[3] + d[6] - 1) % 49 + 49) % 49 + 1 },
  { id: 50, name: '次级混合和', category: 'sum', fn: (d) => ((d[0] + d[3] + d[5] - 1) % 49 + 49) % 49 + 1 }
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

  // 记录各方案的数据
  const stats = {
    baseline: { correct: 0, total: 300 },
    strategy1_veto_repeat: { correct: 0, total: 300 },
    strategy2_error_freeze: { correct: 0, total: 300 },
    strategy3_dedup_category: { correct: 0, total: 300 },
    strategy_combined: { correct: 0, total: 300 }
  };

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw = history[i - 1];
    const startIdx = i - windowSize;

    // 1. 各个公式在之前 100 期的胜率与最新预测
    const rulesStats = MATH_RULES.map((rule) => {
      let successCount = 0;
      let totalCount = 0;
      let lastFailed = false; // 是否在最近 3 期内翻车过

      for (let j = startIdx; j < i; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (pD && cD) {
          const predicted = rule.fn(pD);
          const ok = !cD.includes(predicted);
          if (ok) {
            successCount++;
          }
          totalCount++;
        }
      }

      // 检查最近 3 期是否翻车
      for (let j = i - 3; j < i; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (pD && cD) {
          const predicted = rule.fn(pD);
          if (cD.includes(predicted)) {
            lastFailed = true;
            break;
          }
        }
      }

      const accuracy = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
      const pred = rule.fn(prevDraw);

      return {
        ...rule,
        accuracy,
        pred,
        lastFailed
      };
    });

    // -------------------------------------------------------------
    // 【方案：Baseline 正常共识】
    // -------------------------------------------------------------
    const getBaselinePreds = () => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3; // 92%
      let qualifiedRules = rulesStats.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 15) {
        qualifiedRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 25);
      }

      const votesMap = {};
      for (let num = 1; num <= 49; num++) votesMap[num] = { num, count: 0, totalAccuracy: 0 };
      for (const r of qualifiedRules) {
        votesMap[r.pred].count++;
        votesMap[r.pred].totalAccuracy += r.accuracy;
      }
      const ranked = Object.values(votesMap).filter(v => v.count > 0);
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);

      const preds = [];
      const used = new Set();
      for (let k = 0; k < 3; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      if (preds.length < 3) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // -------------------------------------------------------------
    // 【策略一：重号避杀过滤 (Veto Repeat Numbers)】
    // -------------------------------------------------------------
    const getStrategy1Preds = () => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3;
      let qualifiedRules = rulesStats.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 15) {
        qualifiedRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 25);
      }

      const votesMap = {};
      for (let num = 1; num <= 49; num++) votesMap[num] = { num, count: 0, totalAccuracy: 0 };
      for (const r of qualifiedRules) {
        votesMap[r.pred].count++;
        votesMap[r.pred].totalAccuracy += r.accuracy;
      }
      // 过滤掉在上期开奖号中的号码
      const ranked = Object.values(votesMap)
        .filter(v => v.count > 0 && !prevDraw.includes(v.num));
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);

      const preds = [];
      const used = new Set();
      for (let k = 0; k < 3; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      if (preds.length < 3) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred) && !prevDraw.includes(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      // 兜底实在不够3个，才允许杀重号
      if (preds.length < 3) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // -------------------------------------------------------------
    // 【策略二：近期翻车公式冷冻 (Short-term Failure Freeze)】
    // -------------------------------------------------------------
    const getStrategy2Preds = () => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3;
      
      // 只保留近期没有翻车的公式
      let activeRules = rulesStats.filter(r => !r.lastFailed);
      
      // 如果被冻结的公式太多，保留至少 15 个公式
      if (activeRules.length < 15) {
        activeRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 20);
      }

      let qualifiedRules = activeRules.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 10) {
        qualifiedRules = [...activeRules].sort((a, b) => b.accuracy - a.accuracy).slice(0, 15);
      }

      const votesMap = {};
      for (let num = 1; num <= 49; num++) votesMap[num] = { num, count: 0, totalAccuracy: 0 };
      for (const r of qualifiedRules) {
        votesMap[r.pred].count++;
        votesMap[r.pred].totalAccuracy += r.accuracy;
      }
      const ranked = Object.values(votesMap).filter(v => v.count > 0);
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);

      const preds = [];
      const used = new Set();
      for (let k = 0; k < 3; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      if (preds.length < 3) {
        const sortedAll = [...activeRules].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // -------------------------------------------------------------
    // 【策略三：同质化公式计票去重 (Category De-duplication)】
    // -------------------------------------------------------------
    const getStrategy3Preds = () => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3;
      let qualifiedRules = rulesStats.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 15) {
        qualifiedRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 25);
      }

      const votesMap = {};
      for (let num = 1; num <= 49; num++) {
        votesMap[num] = { num, count: 0, categoriesUsed: new Set(), totalAccuracy: 0 };
      }

      for (const r of qualifiedRules) {
        const item = votesMap[r.pred];
        // 限制：每个分类（sum、prod、diff）在一个预测号码上最多只能投 1 票
        if (!item.categoriesUsed.has(r.category)) {
          item.categoriesUsed.add(r.category);
          item.count++;
          item.totalAccuracy += r.accuracy;
        }
      }

      const ranked = Object.values(votesMap).filter(v => v.count > 0);
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);

      const preds = [];
      const used = new Set();
      for (let k = 0; k < 3; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      if (preds.length < 3) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // -------------------------------------------------------------
    // 【策略四：组合方案 (Combined Strategy)】
    // -------------------------------------------------------------
    const getCombinedPreds = () => {
      const targetThreshold = 95;
      const votingThreshold = targetThreshold - 3;
      
      // 1. 冷冻近期失败的公式
      let activeRules = rulesStats.filter(r => !r.lastFailed);
      if (activeRules.length < 15) {
        activeRules = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 20);
      }

      let qualifiedRules = activeRules.filter((r) => r.accuracy >= votingThreshold);
      if (qualifiedRules.length < 10) {
        qualifiedRules = [...activeRules].sort((a, b) => b.accuracy - a.accuracy).slice(0, 15);
      }

      // 2. 去重计票 (同类限制)
      const votesMap = {};
      for (let num = 1; num <= 49; num++) {
        votesMap[num] = { num, count: 0, categoriesUsed: new Set(), totalAccuracy: 0 };
      }

      for (const r of qualifiedRules) {
        const item = votesMap[r.pred];
        if (!item.categoriesUsed.has(r.category)) {
          item.categoriesUsed.add(r.category);
          item.count++;
          item.totalAccuracy += r.accuracy;
        }
      }

      // 3. 排除上期已开奖号
      const ranked = Object.values(votesMap)
        .filter(v => v.count > 0 && !prevDraw.includes(v.num));
      ranked.sort((a, b) => b.count - a.count || (b.totalAccuracy/b.count) - (a.totalAccuracy/a.count) || a.num - b.num);

      const preds = [];
      const used = new Set();
      for (let k = 0; k < 3; k++) {
        if (ranked[k]) {
          preds.push(ranked[k].num);
          used.add(ranked[k].num);
        }
      }
      if (preds.length < 3) {
        const sortedAll = [...activeRules].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred) && !prevDraw.includes(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      // 最低兜底
      if (preds.length < 3) {
        const sortedAll = [...rulesStats].sort((a, b) => b.accuracy - a.accuracy);
        for (const r of sortedAll) {
          if (preds.length >= 3) break;
          if (!used.has(r.pred)) {
            used.add(r.pred);
            preds.push(r.pred);
          }
        }
      }
      return preds;
    };

    // 验证各方案
    const baselinePreds = getBaselinePreds();
    if (baselinePreds.filter(p => currentDraw.includes(p)).length === 0) stats.baseline.correct++;

    const s1Preds = getStrategy1Preds();
    if (s1Preds.filter(p => currentDraw.includes(p)).length === 0) stats.strategy1_veto_repeat.correct++;

    const s2Preds = getStrategy2Preds();
    if (s2Preds.filter(p => currentDraw.includes(p)).length === 0) stats.strategy2_error_freeze.correct++;

    const s3Preds = getStrategy3Preds();
    if (s3Preds.filter(p => currentDraw.includes(p)).length === 0) stats.strategy3_dedup_category.correct++;

    const combinedPreds = getCombinedPreds();
    if (combinedPreds.filter(p => currentDraw.includes(p)).length === 0) stats.strategy_combined.correct++;
  }

  console.log('\n========================================================================');
  console.log(`回测样本数：${testPeriods} 期 | 历史滑动窗口：${windowSize} 期`);
  console.log('========================================================================');
  console.log('规避策略方案                         | 排除全对期数/总期数 | 排除全对概率  | 净提升效果');
  console.log('------------------------------------------------------------------------');
  
  const printRow = (label, key) => {
    const s = stats[key];
    const rate = ((s.correct / s.total) * 100).toFixed(2);
    const diff = (rate - ((stats.baseline.correct / stats.baseline.total) * 100)).toFixed(2);
    const diffStr = diff >= 0 ? `+${diff}%` : `${diff}%`;
    console.log(`${label.padEnd(35)} | ${String(s.correct).padStart(9)}/${s.total} | ${rate.padStart(11)}% | ${diffStr.padStart(8)}`);
  };

  printRow('Baseline (当前共识投票方案)', 'baseline');
  printRow('方案一 (重号避杀：排除上期已开号码)', 'strategy1_veto_repeat');
  printRow('方案二 (公式近期错即冻结 3 期)', 'strategy2_error_freeze');
  printRow('方案三 (同类去重：和/积/差限投1票)', 'strategy3_dedup_category');
  printRow('方案四 (三合一组合优化方案)', 'strategy_combined');
  console.log('========================================================================\n');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

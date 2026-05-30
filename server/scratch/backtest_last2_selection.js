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

  const results = {
    // 策略 A: 纯随机选一个上两期开奖号进行排除
    randomLast2: { correct: 0, total: 0 },
    // 策略 B: 排除上两期都有开出的重叠号 (连续重复号)
    repeatLast2: { correct: 0, total: 0, skipped: 0 },
    // 策略 C: 50套公式计票共识最高的那个上两期开出号进行排除
    consensusLast2: { correct: 0, total: 0 }
  };

  for (let i = N - testPeriods; i < N; i++) {
    const currentDraw = history[i];
    const prevDraw1 = history[i - 1]; // 上 1 期
    const prevDraw2 = history[i - 2]; // 上 2 期
    const startIdx = i - windowSize;

    // 前两期开出的所有数字合集 (Union)
    const unionSet = new Set([...prevDraw1, ...prevDraw2]);
    const unionList = Array.from(unionSet);

    // 前两期都开出的数字合集 (Intersection / 重叠号)
    const intersectList = prevDraw1.filter(n => prevDraw2.includes(n));

    // 1. 策略 A: 从合集中随机选一个进行排除
    if (unionList.length > 0) {
      // 为了消除随机选择的偏差，我们直接计算该期 union 中所有号码的平均排除成功率
      let correctCount = 0;
      for (const n of unionList) {
        if (!currentDraw.includes(n)) correctCount++;
      }
      results.randomLast2.correct += (correctCount / unionList.length);
      results.randomLast2.total++;
    }

    // 2. 策略 B: 排除前两期的重叠号 (若有多个，计算平均值；若无重叠号则跳过)
    if (intersectList.length > 0) {
      let correctCount = 0;
      for (const n of intersectList) {
        if (!currentDraw.includes(n)) correctCount++;
      }
      results.repeatLast2.correct += (correctCount / intersectList.length);
      results.repeatLast2.total++;
    } else {
      results.repeatLast2.skipped++;
    }

    // 3. 策略 C: 50套公式共识最高的那个“在前两期开出过”的号码
    // 回测各个公式的滚动胜率
    const stats = MATH_RULES.map((rule) => {
      let sc = 0, tc = 0;
      for (let j = startIdx; j < i; j++) {
        const pD = history[j - 1];
        const cD = history[j];
        if (pD && cD) {
          const predicted = rule.fn(pD);
          if (!cD.includes(predicted)) sc++;
          tc++;
        }
      }
      const accuracy = tc > 0 ? (sc / tc) * 100 : 0;
      const pred = rule.fn(prevDraw1);
      return { ...rule, accuracy, pred };
    });

    // 筛选前 25 个公式
    const sortedStats = [...stats].sort((a, b) => b.accuracy - a.accuracy);
    const qualifiedRules = sortedStats.slice(0, 25);

    // 计票
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

    // 排序，但只保留“在前两期开奖号合集 (unionList) 中”的预测号
    const rankedUnionNumbers = Object.values(votesMap)
      .filter((item) => item.count > 0 && unionSet.has(item.num));

    rankedUnionNumbers.sort((a, b) => b.count - a.count || (b.totalAccuracy / b.count) - (a.totalAccuracy / a.count) || a.num - b.num);

    let selectedNum = null;
    if (rankedUnionNumbers.length > 0) {
      selectedNum = rankedUnionNumbers[0].num;
    } else {
      // 兜底：若公式预测没一个落在前两期开奖号中，取胜率最高的公式直接预测的在前两期中开出的号码
      for (const ruleStat of sortedStats) {
        if (ruleStat.pred && unionSet.has(ruleStat.pred)) {
          selectedNum = ruleStat.pred;
          break;
        }
      }
      // 再次防空：若实在没有，就从 unionList 随机选一个
      if (selectedNum === null && unionList.length > 0) {
        selectedNum = unionList[0];
      }
    }

    if (selectedNum !== null) {
      if (!currentDraw.includes(selectedNum)) {
        results.consensusLast2.correct++;
      }
      results.consensusLast2.total++;
    }
  }

  console.log('\n===================================================================================');
  console.log(`回测样本数：${testPeriods} 期 | 评估“在上两期开奖号里选一个排除”的概率`);
  console.log('===================================================================================');
  console.log('排除策略方案                                   | 预测期数/总期数 | 空仓率  | 排除成功概率');
  console.log('-----------------------------------------------------------------------------------');
  
  const printRow = (label, obj) => {
    const total = obj.total;
    const skipped = obj.skipped !== undefined ? obj.skipped : 0;
    const rate = total > 0 ? ((obj.correct / total) * 100).toFixed(2) : '0.00';
    const skipRate = ((skipped / 300) * 100).toFixed(1) + '%';
    const countStr = `${Math.round(obj.correct)}/${total}`;
    console.log(`${label.padEnd(46)} | ${countStr.padStart(15)} | ${skipRate.padStart(6)} | ${rate.padStart(11)}%`);
  };

  printRow('1. 随机选一个上两期的开奖号进行排除', results.randomLast2);
  printRow('2. 排除上两期连续开出的重叠号 (重号排除)', results.repeatLast2);
  printRow('3. 排除上两期中被公式共识投票最高的号码', results.consensusLast2);
  console.log('-----------------------------------------------------------------------------------');
  console.log('参考：排除一码 Baseline (纯公式直接杀一，不限制必须在前两期内) : 88.67%');
  console.log('===================================================================================\n');

  await connection.end();
}

main().catch(err => {
  console.error(err);
});

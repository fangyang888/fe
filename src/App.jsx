import React, { useState, useEffect } from "react";
// import { Line } from "react-chartjs-2";
// import "chart.js/auto";
// @ts-ignore
import NumberDigitPredictor from "./NumberDigitPredictor.jsx";

export default function LotteryPredictor() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [hotCold, setHotCold] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selectedNumbers, setSelectedNumbers] = useState(null);
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);

  const clamp = (v) => Math.max(1, Math.min(49, Math.round(v)));

  const linearFit = (xs, ys) => {
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b) / n;
    const meanY = ys.reduce((a, b) => a + b) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += Math.pow(xs[i] - meanX, 2);
    }
    const a = den === 0 ? 0 : num / den;
    const b = meanY - a * meanX;

    let ssTot = 0,
      ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = a * xs[i] + b;
      ssTot += Math.pow(ys[i] - meanY, 2);
      ssRes += Math.pow(ys[i] - pred, 2);
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { a, b, r2, residual: Math.sqrt(ssRes / n) };
  };

  const parseInput = () =>
    input
      .trim()
      .split(/\n/)
      .map((line) => line.split(/[, ]+/).map(Number));

  const predictB = (history) => {
    const rows = history.length;
    const xs = Array.from({ length: rows }, (_, i) => i);
    return history[0].map((_, c) => {
      const ys = history.map((r) => r[c]);
      const { a, b } = linearFit(xs, ys);
      return clamp(a * rows + b);
    });
  };

  const predictC = (history) => {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    return last.map((v, c) => clamp(v + (v - prev[c])));
  };

  // 轻量级逻辑回归：用历史特征对 1-49 号做二分类，给出概率最高的 7 个
  const buildFeatures = (history, num) => {
    const rows = history.length;
    const longFreq = rows === 0 ? 0 : history.flat().filter((n) => n === num).length / (rows * 7);
    const shortWindow = history.slice(-Math.min(rows, 20));
    const shortFreq =
      shortWindow.length === 0
        ? 0
        : shortWindow.flat().filter((n) => n === num).length / (shortWindow.length * 7);
    let lastSeen = rows;
    for (let i = rows - 1; i >= 0; i--) {
      if (history[i].includes(num)) {
        lastSeen = rows - 1 - i;
        break;
      }
    }
    const recency = rows === 0 ? 1 : Math.min(lastSeen / rows, 1);
    return [shortFreq, longFreq, recency];
  };

  const trainLogistic = (history) => {
    const rows = history.length;
    if (rows < 4) return null; // 数据太少就不训了
    const X = [];
    const y = [];
    for (let i = 1; i < rows; i++) {
      const past = history.slice(0, i);
      for (let num = 1; num <= 49; num++) {
        X.push(buildFeatures(past, num));
        y.push(history[i].includes(num) ? 1 : 0);
      }
    }
    const w = [0, 0, 0];
    const lr = 0.5;
    const epochs = 120;
    const n = X.length;
    for (let e = 0; e < epochs; e++) {
      let g0 = 0,
        g1 = 0,
        g2 = 0;
      for (let j = 0; j < n; j++) {
        const [x0, x1, x2] = X[j];
        const p = sigmoid(w[0] * x0 + w[1] * x1 + w[2] * x2);
        const diff = p - y[j];
        g0 += diff * x0;
        g1 += diff * x1;
        g2 += diff * x2;
      }
      w[0] -= (lr * g0) / n;
      w[1] -= (lr * g1) / n;
      w[2] -= (lr * g2) / n;
    }
    return w;
  };

  const predictM = (history) => {
    const w = trainLogistic(history);
    if (!w) return null;
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      const f = buildFeatures(history, num);
      return { num, p: sigmoid(dot(w, f)) };
    });
    scores.sort((a, b) => b.p - a.p);
    return scores.slice(0, 7).map((s) => s.num);
  };


  const predictI = (history) => {
    const rows = history.length;
    const last = history[rows - 1];
    const prev = history[rows - 2];
    return last.map((v, c) => clamp(history.reduce((s, r) => s + r[c], 0) / rows + (v - prev[c])));
  };

  // 反预测算法：预测不在下一行中出现的数字
  // 基于规律：排除其他预测方法、热号，选择频率低、长时间未出现的数字
  const predictN = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    // 获取其他预测方法的结果
    const predB = predictB(history);
    const predC = predictC(history);
    const predI = predictI(history);
    const predM = predictM(history);
    const hotCold = computeHotCold(history);

    // 合并所有预测结果和热号（这些数字更可能出现，需要排除）
    const excludeSet = new Set([
      ...predB,
      ...predC,
      ...predI,
      ...(predM || []),
      ...hotCold.hot,
    ]);

    // 计算每个数字的"不出现分数"
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;

      // 如果已经在排除列表中，分数为0
      if (excludeSet.has(num)) {
        return { num, score: 0 };
      }

      // 计算频率（越低越好）
      const freq = history.flat().filter((n) => n === num).length;
      const freqScore = 1 - freq / (rows * 7); // 频率越低，分数越高

      // 计算最近出现时间（越久越好）
      let lastSeen = rows;
      for (let i = rows - 1; i >= 0; i--) {
        if (history[i].includes(num)) {
          lastSeen = rows - 1 - i;
          break;
        }
      }
      const recencyScore = lastSeen / rows; // 越久未出现，分数越高

      // 计算短期频率（最近20期，越低越好）
      const shortWindow = history.slice(-Math.min(rows, 20));
      const shortFreq = shortWindow.flat().filter((n) => n === num).length;
      const shortFreqScore = 1 - shortFreq / (shortWindow.length * 7);

      // 综合分数：频率低 + 长时间未出现 + 短期频率低
      const score = freqScore * 0.3 + recencyScore * 0.4 + shortFreqScore * 0.3;

      return { num, score };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 7).map((s) => s.num);
  };

  // 规则X：上一行数字不在下一行中
  // 逻辑：排除上一行的7个数字，从剩余42个数字中，选择历史出现频率最高的7个
  const predictX = (history) => {
    const rows = history.length;
    if (rows < 1) return null;

    // 1. 获取上一行的数字
    const lastRow = history[rows - 1];
    const excludeSet = new Set(lastRow);

    // 2. 计算所有数字的历史频率
    const freq = Array(50).fill(0);
    // 使用所有历史数据计算频率
    history.flat().forEach(num => freq[num]++);

    // 3. 构建候选池（1-49），排除上一行的数字
    const candidates = [];
    for (let i = 1; i <= 49; i++) {
      if (!excludeSet.has(i)) {
        candidates.push({ num: i, count: freq[i] });
      }
    }

    // 4. 按频率降序排序，取前7个
    candidates.sort((a, b) => b.count - a.count);
    return candidates.slice(0, 7).map(c => c.num);
  };

  // 学习算法：基于历史模式学习，结合多个特征进行预测
  const predictL = (history) => {
    const rows = history.length;
    if (rows < 5) return null; // 需要足够的历史数据

    // 1. 学习序列模式：分析连续出现的数字模式
    const sequencePatterns = {};
    for (let i = 1; i < rows; i++) {
      const prevRow = history[i - 1];
      const currRow = history[i];
      prevRow.forEach((prevNum) => {
        currRow.forEach((currNum) => {
          const key = `${prevNum}-${currNum}`;
          sequencePatterns[key] = (sequencePatterns[key] || 0) + 1;
        });
      });
    }

    // 2. 学习位置模式：分析每个位置数字的转移规律
    const positionPatterns = Array(7).fill(null).map(() => ({}));
    for (let i = 1; i < rows; i++) {
      for (let pos = 0; pos < 7; pos++) {
        const prevNum = history[i - 1][pos];
        const currNum = history[i][pos];
        const key = `${prevNum}-${currNum}`;
        if (!positionPatterns[pos][key]) {
          positionPatterns[pos][key] = 0;
        }
        positionPatterns[pos][key]++;
      }
    }

    // 3. 学习数字组合：分析哪些数字经常一起出现
    const cooccurrence = {};
    history.forEach((row) => {
      for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
          const num1 = Math.min(row[i], row[j]);
          const num2 = Math.max(row[i], row[j]);
          const key = `${num1}-${num2}`;
          cooccurrence[key] = (cooccurrence[key] || 0) + 1;
        }
      }
    });

    // 4. 计算每个数字的得分
    const lastRow = history[rows - 1];
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      let score = 0;

      // 特征1：基于序列模式（上一行数字到当前数字的转移概率）
      let seqScore = 0;
      let seqCount = 0;
      lastRow.forEach((prevNum) => {
        const key = `${prevNum}-${num}`;
        if (sequencePatterns[key]) {
          seqScore += sequencePatterns[key];
          seqCount++;
        }
      });
      if (seqCount > 0) {
        score += (seqScore / seqCount) * 0.3; // 权重30%
      }

      // 特征2：基于位置模式（每个位置的转移概率）
      let posScore = 0;
      let posCount = 0;
      for (let pos = 0; pos < 7; pos++) {
        const prevNum = lastRow[pos];
        const key = `${prevNum}-${num}`;
        if (positionPatterns[pos][key]) {
          posScore += positionPatterns[pos][key];
          posCount++;
        }
      }
      if (posCount > 0) {
        score += (posScore / posCount) * 0.25; // 权重25%
      }

      // 特征3：基于数字组合（与上一行数字的共现频率）
      let coScore = 0;
      let coCount = 0;
      lastRow.forEach((prevNum) => {
        const num1 = Math.min(prevNum, num);
        const num2 = Math.max(prevNum, num);
        const key = `${num1}-${num2}`;
        if (cooccurrence[key]) {
          coScore += cooccurrence[key];
          coCount++;
        }
      });
      if (coCount > 0) {
        score += (coScore / coCount) * 0.15; // 权重15%
      }

      // 特征4：基于频率（最近出现频率）
      const recentWindow = history.slice(-Math.min(rows, 15));
      const recentFreq = recentWindow.flat().filter((n) => n === num).length;
      score += (recentFreq / (recentWindow.length * 7)) * 0.15; // 权重15%

      // 特征5：基于间隔（距离上次出现的时间）
      let lastSeen = rows;
      for (let i = rows - 1; i >= 0; i--) {
        if (history[i].includes(num)) {
          lastSeen = rows - 1 - i;
          break;
        }
      }
      // 间隔越短，分数越高（最近出现的更可能再次出现）
      score += (1 / (lastSeen + 1)) * 0.15; // 权重15%

      return { num, score };
    });

    // 5. 结合其他算法的预测结果（集成学习）
    const predB = predictB(history);
    const predC = predictC(history);
    const predI = predictI(history);
    const predM = predictM(history);
    const predX = predictX(history);

    // 如果数字在其他算法中也出现，增加分数
    scores.forEach((item) => {
      if (predB.includes(item.num)) item.score += 0.5;
      if (predC.includes(item.num)) item.score += 0.5;
      if (predI.includes(item.num)) item.score += 0.5;
      if (predM && predM.includes(item.num)) item.score += 0.5;
      if (predX && predX.includes(item.num)) item.score += 0.5;
    });

    // 按分数降序排序，选择前7个
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 7).map((s) => s.num);
  };

  const computeHotCold = (history) => {
    const freq = Array(50).fill(0);
    history.flat().forEach((num) => freq[num]++);
    const sorted = [...Array(49).keys()].map((i) => i + 1).sort((a, b) => freq[b] - freq[a]);
    return {
      hot: sorted.slice(0, 7),
      cold: sorted.slice(-7),
    };
  };

  const buildChart = (history) => {
    const labels = history.map((_, i) => `期${i + 1}`);
    const datasets = Array.from({ length: 7 }, (_, col) => ({
      label: `列 ${col + 1}`,
      data: history.map((r) => r[col]),
    }));
    setChartData({ labels, datasets });
  };

  // 统计最后18行：对每一行用之前数据预测，与下一行对比，并计算热号冷号
  const calculateStatistics = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    const last18Rows = Math.min(18, rows - 1); // 最后18行，但需要至少2行才能比较
    const startIdx = rows - last18Rows - 1; // 从倒数第19行开始（因为需要预测下一行）

    const details = [];

    for (let i = startIdx; i < rows - 1; i++) {
      const pastHistory = history.slice(0, i + 1);
      const currentRow = history[i];
      const nextRow = history[i + 1];
      const period = i + 2;

      // 计算热号冷号（基于当前行之前的所有数据）
      const hotCold = computeHotCold(pastHistory);
      const matchedHot = hotCold.hot.filter((num) => nextRow.includes(num));
      const matchedCold = hotCold.cold.filter((num) => nextRow.includes(num));

      // 预测方法 B
      const predB = predictB(pastHistory);
      const matchedB = predB.filter((num) => nextRow.includes(num));

      // 预测方法 C
      const predC = predictC(pastHistory);
      const matchedC = predC.filter((num) => nextRow.includes(num));

      // 预测方法 I
      const predI = predictI(pastHistory);
      const matchedI = predI.filter((num) => nextRow.includes(num));

      // 预测方法 M
      const predM = predictM(pastHistory);
      const matchedM = predM ? predM.filter((num) => nextRow.includes(num)) : [];

      // 反预测方法 N（预测不在下一行中出现的数字）
      const predN = predictN(pastHistory);
      const matchedN = predN ? predN.filter((num) => nextRow.includes(num)) : [];

      // 学习算法 L
      const predL = predictL(pastHistory);
      const matchedL = predL ? predL.filter((num) => nextRow.includes(num)) : [];

      // 规则 X
      const predX = predictX(pastHistory);
      const matchedX = predX ? predX.filter((num) => nextRow.includes(num)) : [];

      details.push({
        period,
        currentRow,
        nextRow,
        hotCold: {
          hot: hotCold.hot,
          cold: hotCold.cold,
          matchedHot,
          matchedCold,
        },
        B: { prediction: predB, matched: matchedB },
        C: { prediction: predC, matched: matchedC },
        I: { prediction: predI, matched: matchedI },
        M: { prediction: predM, matched: matchedM },
        N: { prediction: predN, matched: matchedN },
        L: { prediction: predL, matched: matchedL },
        X: { prediction: predX, matched: matchedX },
      });
    }

    return { details };
  };

  // 分析每个算法每个位置的不匹配率，推荐10个最可能不在下一行中出现的数字
  const calculateSummary = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    const last18Rows = Math.min(18, rows - 1);
    const startIdx = rows - last18Rows - 1;

    // 统计每个算法每个位置的不匹配次数
    const positionStats = {
      B: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      C: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      I: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      M: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      N: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      L: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      X: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
    };

    // 新增：统计每个算法的匹配数分布（用于识别只匹配1-2个数字的算法）
    const methodMatchDistribution = {
      B: { total: 0, matchCounts: {} }, // matchCounts: { 0: 5, 1: 3, 2: 2, ... } 表示匹配0个的有5次，匹配1个的有3次等
      C: { total: 0, matchCounts: {} },
      I: { total: 0, matchCounts: {} },
      M: { total: 0, matchCounts: {} },
      N: { total: 0, matchCounts: {} },
      L: { total: 0, matchCounts: {} },
      X: { total: 0, matchCounts: {} },
    };

    for (let i = startIdx; i < rows - 1; i++) {
      const pastHistory = history.slice(0, i + 1);
      const nextRow = history[i + 1];

      // B方法
      const predB = predictB(pastHistory);
      const matchedB = predB.filter((num) => nextRow.includes(num));
      methodMatchDistribution.B.total++;
      methodMatchDistribution.B.matchCounts[matchedB.length] = (methodMatchDistribution.B.matchCounts[matchedB.length] || 0) + 1;
      predB.forEach((num, pos) => {
        positionStats.B[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.B[pos].unmatched++;
          positionStats.B[pos].numbers[num] = (positionStats.B[pos].numbers[num] || 0) + 1;
        }
      });

      // C方法
      const predC = predictC(pastHistory);
      const matchedC = predC.filter((num) => nextRow.includes(num));
      methodMatchDistribution.C.total++;
      methodMatchDistribution.C.matchCounts[matchedC.length] = (methodMatchDistribution.C.matchCounts[matchedC.length] || 0) + 1;
      predC.forEach((num, pos) => {
        positionStats.C[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.C[pos].unmatched++;
          positionStats.C[pos].numbers[num] = (positionStats.C[pos].numbers[num] || 0) + 1;
        }
      });

      // I方法
      const predI = predictI(pastHistory);
      const matchedI = predI.filter((num) => nextRow.includes(num));
      methodMatchDistribution.I.total++;
      methodMatchDistribution.I.matchCounts[matchedI.length] = (methodMatchDistribution.I.matchCounts[matchedI.length] || 0) + 1;
      predI.forEach((num, pos) => {
        positionStats.I[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.I[pos].unmatched++;
          positionStats.I[pos].numbers[num] = (positionStats.I[pos].numbers[num] || 0) + 1;
        }
      });

      // M方法
      const predM = predictM(pastHistory);
      if (predM) {
        const matchedM = predM.filter((num) => nextRow.includes(num));
        methodMatchDistribution.M.total++;
        methodMatchDistribution.M.matchCounts[matchedM.length] = (methodMatchDistribution.M.matchCounts[matchedM.length] || 0) + 1;
        predM.forEach((num, pos) => {
          positionStats.M[pos].total++;
          if (!nextRow.includes(num)) {
            positionStats.M[pos].unmatched++;
            positionStats.M[pos].numbers[num] = (positionStats.M[pos].numbers[num] || 0) + 1;
          }
        });
      }

      // N方法
      const predN = predictN(pastHistory);
      if (predN) {
        const matchedN = predN.filter((num) => nextRow.includes(num));
        methodMatchDistribution.N.total++;
        methodMatchDistribution.N.matchCounts[matchedN.length] = (methodMatchDistribution.N.matchCounts[matchedN.length] || 0) + 1;
        predN.forEach((num, pos) => {
          positionStats.N[pos].total++;
          if (!nextRow.includes(num)) {
            positionStats.N[pos].unmatched++;
            positionStats.N[pos].numbers[num] = (positionStats.N[pos].numbers[num] || 0) + 1;
          }
        });
      }

      // L方法（学习算法）
      const predL = predictL(pastHistory);
      if (predL) {
        const matchedL = predL.filter((num) => nextRow.includes(num));
        methodMatchDistribution.L.total++;
        methodMatchDistribution.L.matchCounts[matchedL.length] = (methodMatchDistribution.L.matchCounts[matchedL.length] || 0) + 1;
        predL.forEach((num, pos) => {
          positionStats.L[pos].total++;
          if (!nextRow.includes(num)) {
            positionStats.L[pos].unmatched++;
            positionStats.L[pos].numbers[num] = (positionStats.L[pos].numbers[num] || 0) + 1;
          }
        });
      }
    }

    // 找出每个算法每个位置的不匹配率（使用平滑处理，避免极端值）
    const positionRates = [];
    Object.keys(positionStats).forEach((method) => {
      positionStats[method].forEach((stat, pos) => {
        if (stat.total > 0) {
          // 使用拉普拉斯平滑（Laplace smoothing）来调整概率
          // 添加伪计数，避免极端概率值
          const alpha = 1; // 平滑参数
          const smoothedRate = (stat.unmatched + alpha) / (stat.total + alpha * 2);

          // 设置合理的上限：即使不匹配率很高，也不应该超过0.85
          // 因为现实中任何数字都有出现的可能性
          const maxRate = 0.85;
          const rate = Math.min(smoothedRate, maxRate);

          positionRates.push({
            method,
            position: pos + 1,
            rate,
            total: stat.total,
            unmatched: stat.unmatched,
            numbers: stat.numbers,
          });
        }
      });
    });

    // 按不匹配率降序排序
    positionRates.sort((a, b) => b.rate - a.rate);

    // 收集所有不匹配的数字及其权重
    const numberScores = {};
    positionRates.forEach((item) => {
      Object.keys(item.numbers).forEach((num) => {
        const numVal = parseInt(num);
        if (!numberScores[numVal]) {
          numberScores[numVal] = { count: 0, totalWeight: 0, sources: [] };
        }
        // 权重 = 不匹配率 * 出现次数
        // 对权重进行平滑处理，避免极端值
        // 使用对数缩放，使权重分布更均匀
        const baseWeight = item.rate * item.numbers[num];
        const weight = baseWeight * (1 + Math.log(item.numbers[num] + 1) / 10); // 轻微的对数增强
        numberScores[numVal].count += item.numbers[num];
        numberScores[numVal].totalWeight += weight;
        numberScores[numVal].sources.push({
          method: item.method,
          position: item.position,
          rate: item.rate,
          count: item.numbers[num],
        });
      });
    });

    // 转换为数组并按权重排序
    const recommendations = Object.keys(numberScores)
      .map((num) => ({
        num: parseInt(num),
        count: numberScores[num].count,
        weight: numberScores[num].totalWeight,
        sources: numberScores[num].sources,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    // 计算每个算法每个位置的平均不匹配率（用于当前预测）
    const methodPositionRates = {};
    positionRates.forEach((item) => {
      const key = `${item.method}_${item.position}`;
      if (!methodPositionRates[key]) {
        methodPositionRates[key] = item.rate;
      }
    });

    // 计算每个算法的低匹配率（只匹配0-2个数字的频率）
    const methodLowMatchRates = {};
    Object.keys(methodMatchDistribution).forEach((method) => {
      const dist = methodMatchDistribution[method];
      if (dist.total > 0) {
        // 计算匹配0-2个数字的频率
        const lowMatchCount = (dist.matchCounts[0] || 0) + (dist.matchCounts[1] || 0) + (dist.matchCounts[2] || 0);
        const lowMatchRate = lowMatchCount / dist.total;
        methodLowMatchRates[method] = {
          rate: lowMatchRate,
          total: dist.total,
          distribution: dist.matchCounts,
        };
      }
    });

    return {
      positionRates: positionRates.slice(0, 20), // 前20个最高不匹配率的位置
      recommendations,
      methodPositionRates, // 用于从当前预测中挑选
      methodLowMatchRates, // 新增：每个算法的低匹配率统计
      recentAccuracy: (() => {
        // 计算最近10期的准确率
        const recentStats = { B: 0, C: 0, I: 0, M: 0, N: 0, L: 0, X: 0 };
        const windowSize = Math.min(10, rows - 1 - startIdx);
        if (windowSize <= 0) return recentStats;

        for (let i = rows - 2; i >= rows - 2 - windowSize + 1; i--) {
          const pastHistory = history.slice(0, i + 1);
          const nextRow = history[i + 1];

          const calcMatch = (pred) => {
            if (!pred || !Array.isArray(pred)) return 0;
            return pred.filter(n => nextRow.includes(n)).length;
          };

          recentStats.B += calcMatch(predictB(pastHistory));
          recentStats.C += calcMatch(predictC(pastHistory));
          recentStats.I += calcMatch(predictI(pastHistory));
          recentStats.M += calcMatch(predictM(pastHistory));
          // N predict what WON'T appear. High match = bad prediction? 
          // Usually lottery predictors predict what WILL appear. 
          // predictN logic calculates "scores" for "not appearing", but returns "scores.slice(0, 7).map...". 
          // Wait, predictN comments say: "按分数降序排序，选择分数最高的7个（最不可能出现的）".
          // So predictN returns numbers that are LEAST likely to appear.
          // So for N, we want LOW match count. 
          // But for consistency in "Performance", let's measure how well it did its job.
          // Its job was to identify non-appearing numbers.
          // Accuracy = (7 - matchCount) / 7.
          const nMatches = calcMatch(predictN(pastHistory));
          recentStats.N += (7 - nMatches);

          recentStats.L += calcMatch(predictL(pastHistory));
          recentStats.X += calcMatch(predictX(pastHistory));
        }

        Object.keys(recentStats).forEach(key => recentStats[key] /= (windowSize * 7)); // Normalize to 0-1
        return recentStats;
      })()
    };
  };

  // 🤖 AI 独立思考推荐算法
  // 结合机器学习权重、结构化启发式规则和独立思考逻辑
  const selectFromCurrentPredictions = (currentResults, summary, history) => {
    if (!summary || !summary.methodPositionRates) return null;
    if (!history || history.length < 10) return null;

    const rows = history.length;
    const hotCold = computeHotCold(history);

    // 1. 动态权重计算 (Dynamic Weighting)
    // 根据最近10期的表现动态调整每个算法的发言权
    const algoWeights = { B: 1, C: 1, I: 1, M: 1, L: 1, X: 1, N: 0.5 }; // N是反向预测，权重特殊处理
    if (summary.recentAccuracy) {
      Object.keys(summary.recentAccuracy).forEach(algo => {
        // 表现越好，权重越高。基准1，每10%准确率增加0.5
        algoWeights[algo] = 1 + (summary.recentAccuracy[algo] || 0) * 5;
      });
    }

    // N (反向预测) 的处理: 它预测的数字是"不应该出现"的。
    // 如果 N 预测准确率高（即它预测的数字确实没出现），那么它列出的数字应该被强烈排除。
    // 但它的返回值是"最不可能出现"的7个数字。所以如果一个数字在N的列表中，它应该被扣分。

    // 2. 候选池评分 (Candidate Scoring)
    const numberScores = Array(50).fill(0).map((_, i) => ({ num: i, score: 0, reasons: [] }));

    // 遍历每个算法的预测
    Object.keys(currentResults).forEach(algo => {
      const pred = currentResults[algo];
      if (!pred || !Array.isArray(pred)) return;

      pred.forEach(num => {
        if (num < 1 || num > 49) return;

        let weight = algoWeights[algo] || 1;

        if (algo === 'N') {
          // N算法预测的是"不出现"。为了"推荐"出现的数字，N列表中的数字应该扣分。
          // 也就意味着：N 认为这些不出现。
          numberScores[num].score -= weight * 2;
          numberScores[num].reasons.push(`N排除`);
        } else {
          // 其他算法预测"出现"
          numberScores[num].score += weight;
          numberScores[num].reasons.push(`${algo}`);
        }
      });
    });

    // 3. 结构化启发式 (Structural Heuristics - Independent Thinking)
    const lastRow = history[rows - 1];
    const excludeSet = new Set(lastRow);

    numberScores.forEach(item => {
      if (item.num === 0) return; // Skip index 0
      let score = item.score;
      const num = item.num;

      // 规则 A: 排除上一行 (Rule X 的核心思想，作为独立思考的硬性过滤器或重罚)
      // 如果数字在上一行，且不是极热号，大幅扣分
      if (excludeSet.has(num)) {
        score -= 5;
        item.reasons.push("上一行重复(扣分)");
      }

      // 规则 B: 黄金分割/平衡区 (15-35)
      // 历史数据显示中间区域数字出现概率略高 (假设)
      if (num >= 15 && num <= 35) {
        score += 0.2;
      }

      // 规则 C: 遗漏值补偿 (Regression to Mean)
      // 查找该数字上次出现距离现在多少期
      let missed = 0;
      for (let i = rows - 1; i >= 0; i--) {
        if (history[i].includes(num)) break;
        missed++;
      }
      // 如果遗漏适中 (5-10期)，增加概率 (蓄势待发)
      if (missed >= 5 && missed <= 10) {
        score += 0.5;
        item.reasons.push("蓄势(5-10期)");
      }
      // 如果遗漏过久 (>20期)，可能是死号，轻微扣分或不加分 (取决于策略，这里假设冷号不做主推)
      if (missed > 20) {
        score -= 0.5;
        item.reasons.push("太冷");
      }

      // 规则 D: 热号跟随
      if (hotCold.hot.slice(0, 3).includes(num)) {
        score += 0.8;
        item.reasons.push("极热");
      }

      item.score = score;
    });

    // 4. 选择与多样性 (Selection & Diversity)
    // 排序
    const sortedCandidates = numberScores.slice(1).sort((a, b) => b.score - a.score); // slice(1) to remove index 0

    // 取前20名进行多样性筛选
    // 我们希望最后10个数字分布相对均匀，不要全挤在一起 (比如 1,2,3,4,5...)
    const finalSelection = [];
    const selectedNums = new Set();

    // 分区计数 (1-10, 11-20, etc.)
    const zones = [0, 0, 0, 0, 0];

    for (const cand of sortedCandidates) {
      if (finalSelection.length >= 10) break;

      const num = cand.num;
      const zoneIdx = Math.floor((num - 1) / 10);

      // 如果该分区已经有3个数字，暂缓选择该数字 (除非分数极高 > 5)
      if (zones[zoneIdx] >= 3 && cand.score < 5) continue;

      finalSelection.push({
        num: cand.num,
        weight: cand.score, // Use score as weight for display
        sources: cand.reasons.map(r => ({ method: r, position: 0 })) // Adapt format for UI
      });
      selectedNums.add(num);
      zones[zoneIdx]++;
    }

    // 如果没凑够10个，从剩下的补
    if (finalSelection.length < 10) {
      for (const cand of sortedCandidates) {
        if (finalSelection.length >= 10) break;
        if (!selectedNums.has(cand.num)) {
          finalSelection.push({
            num: cand.num,
            weight: cand.score,
            sources: cand.reasons.map(r => ({ method: r, position: 0 }))
          });
          selectedNums.add(cand.num);
        }
      }
    }

    return finalSelection.sort((a, b) => a.num - b.num); // Sort by number for display, or weight? User usually likes sorted numbers.
    // The previous implementation sorted by weight. Let's stick to weight for "Recommendation" or Number for "Ticket". 
    // The UI shows "Top 10", usually implies sorted by rank. Let's return sorted by weight descending.
    return finalSelection.sort((a, b) => b.weight - a.weight);
  };

  // 初始化时从静态文件读取历史数据
  useEffect(() => {
    const loadHistory = async () => {
      // 尝试多个可能的路径
      const paths = [
        "/fe/history.txt", // 生产环境（GitHub Pages）
        "/history.txt", // 开发环境或根路径
        "./history.txt", // 相对路径
        "history.txt", // 当前目录
      ];

      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const text = await response.text();
            if (text.trim()) {
              setInput(text.trim());
              console.log(`成功从 ${path} 加载历史数据`);
              return;
            }
          }
        } catch (err) {
          // 继续尝试下一个路径
          console.log(`无法从 ${path} 加载:`, err.message);
        }
      }

      // 所有路径都失败
      console.log("未找到 history.txt 文件，使用空输入");
    };
    loadHistory();
  }, []);

  const saveHistoryToFile = async (historyString) => {
    // 通过 API 请求保存到 public/history.txt（开发环境）
    try {
      const response = await fetch("/api/save-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: historyString }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log("历史数据已保存到 public/history.txt");
        } else {
          throw new Error(result.error || "保存失败");
        }
      } else {
        throw new Error("保存请求失败");
      }
    } catch (err) {
      // API 不可用（生产环境），这是正常的
      console.log("生产环境无法保存文件，数据仅在当前会话有效");
    }
  };

  const runPrediction = async (flag = true) => {
    const history = parseInput();

    if (!history.length || history[0].length !== 7) return alert("格式错误：每行必须是7个数字");
    setLoading(true);
    if (flag) {
      // 将 history 转换为字符串并保存
      const historyString = history.map((row) => row.join(", ")).join("\n");
      saveHistoryToFile(historyString);
    }

    const rows = history.length;
    const xs = Array.from({ length: rows }, (_, i) => i);

    setMetrics(
      history[0].map((_, c) =>
        linearFit(
          xs,
          history.map((row) => row[c])
        )
      )
    );

    try {
      const currentResults = {
        B: predictB(history),
        C: predictC(history),
        I: predictI(history),
        M: predictM(history),
        N: predictN(history),
        L: predictL(history),
        X: predictX(history),
      };

      setResults(currentResults);

      setHotCold(computeHotCold(history));
      buildChart(history);
      setStatistics(calculateStatistics(history));
      const summaryData = calculateSummary(history);
      setSummary(summaryData);

      // 根据统计概率从当前预测中挑选10个数字（传入历史数据用于学习）
      if (summaryData) {
        const selected = selectFromCurrentPredictions(currentResults, summaryData, history);
        setSelectedNumbers(selected);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "100%",
        boxSizing: "border-box",
        fontSize: "14px",
      }}
    >
      <h2 style={{ fontSize: "18px", marginBottom: "15px" }}>
        （增强版 B/C/I + 趋势图 + 热冷分析）
      </h2>

      <textarea
        style={{
          width: "100%",
          height: 140,
          padding: "10px",
          boxSizing: "border-box",
          fontSize: "14px",
          fontFamily: "monospace",
        }}
        placeholder="输入历史数据，每行7个数字"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        onClick={runPrediction}
        disabled={loading}
        style={{
          marginTop: 10,
          padding: "12px 24px",
          fontSize: "16px",
          minHeight: "44px", // 移动端友好的触摸目标
          cursor: "pointer",
        }}
      >
        开始预测
      </button>
      <button
        onClick={() => runPrediction(false)}
        disabled={loading}
        style={{
          marginTop: 10,
          padding: "12px 24px",
          fontSize: "16px",
          minHeight: "44px", // 移动端友好的触摸目标
          cursor: "pointer",
        }}
      >
        开始预测不保存
      </button>
      {loading && <p style={{ marginTop: 10 }}>预测中，请稍候...</p>}

      {results && (
        <div style={{ marginTop: 20 }}>
          <h3>预测结果</h3>
          <p>
            <b>B趋势回归：</b>
            {results.B.join(", ")}
          </p>
          <p>
            <b>C差值外推：</b>
            {results.C.join(", ")}
          </p>
          <p>
            <b>I平均+动量：</b>
            {results.I.join(", ")}
          </p>
          {results.M && (
            <p>
              <b>M逻辑回归（特征：短期/长期频率 + 最近未出现）：</b>
              {results.M.join(", ")}
            </p>
          )}
          {results.N && (
            <p>
              <b>N反预测（预测不在下一行中出现的数字）：</b>
              {results.N.join(", ")}
            </p>
          )}
          {results.L && (
            <p>
              <b>L学习算法（基于历史模式学习：序列模式+位置模式+数字组合+频率+间隔）：</b>
              {results.L.join(", ")}
            </p>
          )}
          {results.X && (
            <p>
              <b>X 排除上一行规则（排除上一行 + 剩余高频）：</b>
              {results.X.join(", ")}
            </p>
          )}
        </div>
      )}

      {hotCold && (
        <div style={{ marginTop: 20 }}>
          <h3>热点分析</h3>
          <p>
            <b>热号 Top7：</b>
            {hotCold.hot.join(", ")}
          </p>
          <p>
            <b>冷号 Bottom7：</b>
            {hotCold.cold.join(", ")}
          </p>
        </div>
      )}

      {statistics && statistics.details && (
        <div style={{ marginTop: 20 }}>
          <h3>统计表格（最后18行数据，最后一行无对比结果不显示）</h3>
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                minWidth: "1800px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f5f5f5" }}>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    期数
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    当前行
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    实际下一行
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    热号Top7（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    冷号Bottom7（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    B预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    C预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    I预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    M预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    N反预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    L学习算法（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    X排除上一行（与下一行对比）
                  </th>
                </tr>
              </thead>
              <tbody>
                {statistics.details.map((detail, idx) => (
                  <tr key={idx}>
                    <td
                      style={{
                        padding: "8px",
                        border: "1px solid #ddd",
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {detail.period}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                      {detail.currentRow.join(", ")}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                      {detail.nextRow.join(", ")}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.hotCold.hot.map((num, i) => {
                          const isMatched = detail.hotCold.matchedHot.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.hotCold.hot.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.hotCold.matchedHot.length} 个：{detail.hotCold.matchedHot.length > 0 ? detail.hotCold.matchedHot.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.hotCold.cold.map((num, i) => {
                          const isMatched = detail.hotCold.matchedCold.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.hotCold.cold.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.hotCold.matchedCold.length} 个：{detail.hotCold.matchedCold.length > 0 ? detail.hotCold.matchedCold.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.B.prediction.map((num, i) => {
                          const isMatched = detail.B.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.B.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.B.matched.length} 个：{detail.B.matched.length > 0 ? detail.B.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.C.prediction.map((num, i) => {
                          const isMatched = detail.C.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.C.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.C.matched.length} 个：{detail.C.matched.length > 0 ? detail.C.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.I.prediction.map((num, i) => {
                          const isMatched = detail.I.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.I.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.I.matched.length} 个：{detail.I.matched.length > 0 ? detail.I.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.M.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.M.prediction.map((num, i) => {
                              const isMatched = detail.M.matched.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isMatched ? "red" : "inherit",
                                      fontWeight: isMatched ? "bold" : "normal",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.M.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.M.matched.length} 个：{detail.M.matched.length > 0 ? detail.M.matched.join(", ") : "无"}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", color: "#999" }}>-</div>
                      )}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.N.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.N.prediction.map((num, i) => {
                              const isMatched = detail.N.matched.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isMatched ? "red" : "inherit",
                                      fontWeight: isMatched ? "bold" : "normal",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.N.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.N.matched.length} 个：{detail.N.matched.length > 0 ? detail.N.matched.join(", ") : "无"}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", color: "#999" }}>-</div>
                      )}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.L.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.L.prediction.map((num, i) => {
                              const isMatched = detail.L.matched.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isMatched ? "red" : "inherit",
                                      fontWeight: isMatched ? "bold" : "normal",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.L.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.L.matched.length} 个：{detail.L.matched.length > 0 ? detail.L.matched.join(", ") : "无"}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", color: "#999" }}>-</div>
                      )}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.X.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.X.prediction.map((num, i) => {
                              const isMatched = detail.X.matched.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isMatched ? "red" : "inherit",
                                      fontWeight: isMatched ? "bold" : "normal",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.X.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.X.matched.length} 个：{detail.X.matched.length > 0 ? detail.X.matched.join(", ") : "无"}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", color: "#999" }}>-</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedNumbers && selectedNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#f0f8ff", borderRadius: "8px", border: "2px solid #2196F3" }}>
          <h3 style={{ marginTop: 0, color: "#0d47a1" }}>
            🤖 AI 独立思考推荐 (Machine Learning & Independent Thinking)
          </h3>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {selectedNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: idx < 3 ? "#fffde7" : idx < 6 ? "#e8f5e9" : "#ffffff",
                    border: `2px solid ${idx < 3 ? "#fbc02d" : idx < 6 ? "#66bb6a" : "#e0e0e0"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                    minWidth: "120px",
                    textAlign: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "6px", color: "#333" }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    推荐指数: {item.weight.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "10px", color: "#555", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px" }}>
                    {item.sources.slice(0, 3).map((s, i) => (
                      <span key={i} style={{ backgroundColor: "#eee", padding: "1px 4px", borderRadius: "3px" }}>
                        {s.method || s.source}
                      </span>
                    ))}
                    {item.sources.length > 3 && <span>...</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#ffffff", borderRadius: "6px", fontSize: "13px", border: "1px solid #e0e0e0" }}>
            <strong>🧠 思考过程：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.6", color: "#444" }}>
              <li><strong>动态权重</strong>: AI 实时分析了近10期各算法准确率，赋予表现好的算法更高权重。</li>
              <li><strong>独立规则</strong>: 整合了"上一行排除"、"遗漏值均衡"、"黄金分割区"等启发式规则。</li>
              <li><strong>结构筛选</strong>: 挑选时考虑了数字在各个分区的分布，避免过于集中。</li>
              <li>注意：此推荐为 AI 基于历史数据的概率推演，仅供参考。</li>
            </ul>
          </div>
        </div>
      )}

      {summary && (
        <div style={{ marginTop: 20 }}>
          <h3>算法分析总结（历史统计推荐）</h3>

          {summary.methodLowMatchRates && Object.keys(summary.methodLowMatchRates).length > 0 && (
            <div style={{ marginTop: 15, padding: "12px", backgroundColor: "#fff3cd", borderRadius: "6px", marginBottom: 15 }}>
              <h4 style={{ marginBottom: 10, color: "#856404" }}>🤖 机器学习分析：低匹配率算法识别</h4>
              <div style={{ fontSize: "13px", lineHeight: "1.8" }}>
                <p style={{ marginBottom: 8 }}><strong>以下算法在历史中经常只匹配1-2个数字（低匹配率算法）：</strong></p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {Object.keys(summary.methodLowMatchRates).map((method) => {
                    const stats = summary.methodLowMatchRates[method];
                    if (stats.rate > 0.5) {
                      return (
                        <div
                          key={method}
                          style={{
                            padding: "8px 12px",
                            backgroundColor: "#ffc107",
                            border: "2px solid #ff9800",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: "bold",
                          }}
                        >
                          <div>算法 {method}</div>
                          <div style={{ fontSize: "11px", marginTop: "4px" }}>
                            低匹配率: {(stats.rate * 100).toFixed(1)}%
                          </div>
                          <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                            匹配分布: {Object.keys(stats.distribution).sort((a, b) => a - b).map(count => `${count}个:${stats.distribution[count]}次`).join(', ')}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                <p style={{ marginTop: 10, fontSize: "12px", color: "#666" }}>
                  💡 机器学习会优先从这些低匹配率算法中挑选数字，因为这些算法预测的数字更可能不出现。
                </p>
              </div>
            </div>
          )}

          <div style={{ marginTop: 15 }}>
            <h4 style={{ marginBottom: 10 }}>推荐列表（按概率排序）：</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: 15 }}>
              {summary.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: idx < 3 ? "#fff3cd" : "#e7f3ff",
                    border: `2px solid ${idx < 3 ? "#ffc107" : "#2196F3"}`,
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px" }}>
                    {rec.num} (权重: {rec.weight.toFixed(3)})
                  </div>
                  <div style={{ fontSize: "11px", color: "#666" }}>
                    出现 {rec.count} 次 | 来源: {rec.sources.map((s) => `${s.method}第${s.position}位`).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 15 }}>
            <h4 style={{ marginBottom: 10 }}>各算法位置不匹配率分析（前20个）：</h4>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  minWidth: "600px",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      算法
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      位置
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      不匹配率
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      不匹配/总数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.positionRates.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        {item.method}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        第{item.position}位
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        <span
                          style={{
                            color: item.rate > 0.7 ? "red" : item.rate > 0.5 ? "orange" : "green",
                            fontWeight: "bold",
                          }}
                        >
                          {(item.rate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        {item.unmatched} / {item.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 15, padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "6px" }}>
            <h4 style={{ marginBottom: 8 }}>分析说明：</h4>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", lineHeight: "1.8" }}>
              <li>
                <strong>推荐数字</strong>：基于历史数据统计，这些数字在各算法预测中不匹配下一行的概率最高
              </li>
              <li>
                <strong>权重计算</strong>：权重 = 不匹配率 × 出现次数，权重越高表示越可靠
              </li>
              <li>
                <strong>位置分析</strong>：显示每个算法每个位置的不匹配率，帮助了解哪个位置最不容易匹配
              </li>
              <li>
                <strong>建议</strong>：优先选择权重最高的前3个数字（黄色高亮），这些是最可能不在下一行中出现的
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* {chartData && (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <h3>走势图（7列分布变化）</h3>
          <div style={{ minWidth: "300px", maxWidth: "100%" }}>
            <Line data={chartData} />
          </div>
        </div>
      )} */}

      {/* {metrics.length > 0 && (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <h3>线性拟合统计</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "400px", // 确保表格在小屏幕上可以横向滚动
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>列</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>斜率</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>截距</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>R²</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>残差</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i}>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{i + 1}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.a.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.b.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.r2.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                    {m.residual.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )} */}

      {/* 数字个位数预测器组件 */}
      {(() => {
        const parsedHistory = parseInput();
        return input.trim() && parsedHistory.length >= 2 ? (
          <div style={{ marginTop: "30px", borderTop: "2px solid #ddd", paddingTop: "20px" }}>
            <NumberDigitPredictor history={parsedHistory} />
          </div>
        ) : null;
      })()}
    </div>
  );
}

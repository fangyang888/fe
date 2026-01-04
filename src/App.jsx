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

    // 按分数降序排序，选择分数最高的7个（最不可能出现的）
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 7).map((s) => s.num);
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

    // 如果数字在其他算法中也出现，增加分数
    scores.forEach((item) => {
      if (predB.includes(item.num)) item.score += 0.5;
      if (predC.includes(item.num)) item.score += 0.5;
      if (predI.includes(item.num)) item.score += 0.5;
      if (predM && predM.includes(item.num)) item.score += 0.5;
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
    };

    // 新增：统计每个算法的匹配数分布（用于识别只匹配1-2个数字的算法）
    const methodMatchDistribution = {
      B: { total: 0, matchCounts: {} }, // matchCounts: { 0: 5, 1: 3, 2: 2, ... } 表示匹配0个的有5次，匹配1个的有3次等
      C: { total: 0, matchCounts: {} },
      I: { total: 0, matchCounts: {} },
      M: { total: 0, matchCounts: {} },
      N: { total: 0, matchCounts: {} },
      L: { total: 0, matchCounts: {} },
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
    };
  };

  // 根据当前预测结果和统计的不匹配率，挑选10个最可能不在下一行中出现的数字
  // 机器学习改进版：分析历史中只匹配1-2个数字的算法，优先从这些算法中挑选
  const selectFromCurrentPredictions = (currentResults, summary, history) => {
    if (!summary || !summary.methodPositionRates) return null;
    if (!history || history.length < 2) return null;

    const rows = history.length;
    const hotCold = computeHotCold(history);

    // 统计每个数字被多少个算法预测（如果被多个算法预测，说明出现的概率高，应该排除）
    const predictionCount = {};
    Object.keys(currentResults).forEach((method) => {
      if (method === 'L' && !currentResults[method]) return;
      const prediction = currentResults[method];
      if (!prediction || !Array.isArray(prediction)) return;
      prediction.forEach((num) => {
        predictionCount[num] = (predictionCount[num] || 0) + 1;
      });
    });

    // 机器学习：分析历史中哪些算法/位置组合在只匹配1-2个数字时，哪些数字更可能不出现
    const mlModel = {}; // { "B_1": { "数字": 不出现概率 }, ... }
    if (summary.methodLowMatchRates && history.length >= 5) {
      const last18Rows = Math.min(18, rows - 1);
      const startIdx = rows - last18Rows - 1;
      
      // 只分析那些匹配率低的算法（只匹配0-2个数字的情况）
      Object.keys(summary.methodLowMatchRates).forEach((method) => {
        const methodStats = summary.methodLowMatchRates[method];
        // 如果这个算法在历史中经常只匹配0-2个数字（低匹配率 > 0.5），则进行学习
        if (methodStats.rate > 0.5) {
          for (let i = startIdx; i < rows - 1; i++) {
            const pastHistory = history.slice(0, i + 1);
            const nextRow = history[i + 1];
            
            let prediction = null;
            if (method === 'B') prediction = predictB(pastHistory);
            else if (method === 'C') prediction = predictC(pastHistory);
            else if (method === 'I') prediction = predictI(pastHistory);
            else if (method === 'M') prediction = predictM(pastHistory);
            else if (method === 'N') prediction = predictN(pastHistory);
            else if (method === 'L') prediction = predictL(pastHistory);
            
            if (prediction && Array.isArray(prediction)) {
              const matched = prediction.filter((num) => nextRow.includes(num));
              // 只学习那些匹配数 <= 2 的情况
              if (matched.length <= 2) {
                prediction.forEach((num, pos) => {
                  const key = `${method}_${pos + 1}`;
                  if (!mlModel[key]) mlModel[key] = {};
                  if (!mlModel[key][num]) {
                    mlModel[key][num] = { total: 0, notAppeared: 0 };
                  }
                  mlModel[key][num].total++;
                  if (!nextRow.includes(num)) {
                    mlModel[key][num].notAppeared++;
                  }
                });
              }
            }
          }
        }
      });
      
      // 计算每个算法/位置/数字的不出现概率
      Object.keys(mlModel).forEach((key) => {
        Object.keys(mlModel[key]).forEach((num) => {
          const stats = mlModel[key][num];
          const notAppearRate = stats.total > 0 ? stats.notAppeared / stats.total : 0;
          mlModel[key][num] = notAppearRate; // 简化为概率值
        });
      });
    }

    // 学习历史数据：分析历史统计中"不匹配率高"但实际还是出现的数字
    // 如果某个数字在历史中不匹配率高，但实际还是经常出现，说明这个指标不够准确
    const historicalLearning = {};
    if (summary.recommendations && summary.recommendations.length > 0) {
      // 检查历史推荐列表中，哪些数字实际上在下一行还是出现了
      const last18Rows = Math.min(18, rows - 1);
      const startIdx = rows - last18Rows - 1;
      
      for (let i = startIdx; i < rows - 1; i++) {
        const pastHistory = history.slice(0, i + 1);
        const nextRow = history[i + 1];
        
        // 模拟历史推荐（简化版，只检查高权重的推荐）
        summary.recommendations.slice(0, 5).forEach((rec) => {
          if (nextRow.includes(rec.num)) {
            // 这个数字被推荐为"不太可能出现"，但实际还是出现了
            historicalLearning[rec.num] = (historicalLearning[rec.num] || 0) + 1;
          }
        });
      }
    }

    const candidates = [];
    const allPredictedNumbers = new Set();

    // 收集所有被预测的数字
    Object.keys(currentResults).forEach((method) => {
      if (method === 'L' && !currentResults[method]) return;
      const prediction = currentResults[method];
      if (!prediction || !Array.isArray(prediction)) return;
      prediction.forEach((num) => {
        allPredictedNumbers.add(num);
      });
    });

    // 从每个算法的预测结果中，根据位置不匹配率和机器学习模型挑选
    Object.keys(currentResults).forEach((method) => {
      if (method === 'L' && !currentResults[method]) return;
      const prediction = currentResults[method];
      if (!prediction || !Array.isArray(prediction)) return;

      // 检查这个算法是否是低匹配率算法（历史中经常只匹配1-2个数字）
      const methodLowMatchRate = summary.methodLowMatchRates?.[method];
      const isLowMatchMethod = methodLowMatchRate && methodLowMatchRate.rate > 0.5;

      prediction.forEach((num, pos) => {
        const key = `${method}_${pos + 1}`;
        let unmatchedRate = summary.methodPositionRates[key] || 0;
        
        // 机器学习增强：如果这个算法/位置/数字组合在历史低匹配情况下有不出现记录
        let mlScore = 0;
        if (mlModel[key] && mlModel[key][num] !== undefined) {
          mlScore = mlModel[key][num]; // 机器学习预测的不出现概率
        }
        
        // 如果这个位置的不匹配率 > 0.4，或者是低匹配率算法，则考虑加入候选
        if (unmatchedRate > 0.4 || (isLowMatchMethod && mlScore > 0.5)) {
          // 基础权重：不匹配率
          let weight = unmatchedRate;
          
          // 机器学习增强：如果这个算法是低匹配率算法，且机器学习模型预测这个数字不出现概率高
          if (isLowMatchMethod && mlScore > 0) {
            // 结合机器学习分数，增加权重
            weight = weight * 0.6 + mlScore * 0.4; // 60%历史不匹配率 + 40%机器学习预测
            // 如果机器学习预测不出现概率很高，额外增加权重
            if (mlScore > 0.7) {
              weight *= 1.3;
            }
          }
          
          // 如果算法是低匹配率算法，额外奖励
          if (isLowMatchMethod) {
            weight *= 1.2; // 低匹配率算法中的数字，权重增加20%
          }
          
          // 惩罚项1：如果这个数字被多个算法预测，说明出现的概率高，应该降低权重
          const predictionCountForNum = predictionCount[num] || 0;
          if (predictionCountForNum > 1) {
            // 被多个算法预测，出现的概率反而高，大幅降低权重
            weight *= (1 - (predictionCountForNum - 1) * 0.3); // 每多一个算法预测，权重降低30%
          }
          
          // 惩罚项2：如果这个数字是热号，出现的概率高，应该降低权重
          if (hotCold.hot.includes(num)) {
            weight *= 0.5; // 热号权重减半
          }
          
          // 惩罚项3：如果这个数字在历史学习中被发现"虽然不匹配率高但还是经常出现"，应该降低权重
          if (historicalLearning[num] && historicalLearning[num] > 0) {
            weight *= (1 - historicalLearning[num] * 0.2); // 每出现一次，权重降低20%
          }
          
          // 奖励项：如果这个数字是冷号，且最近很久没出现，增加权重
          if (hotCold.cold.includes(num)) {
            let lastSeen = rows;
            for (let i = rows - 1; i >= 0; i--) {
              if (history[i].includes(num)) {
                lastSeen = rows - 1 - i;
                break;
              }
            }
            if (lastSeen > rows * 0.3) { // 超过30%的期数没出现
              weight *= 1.2; // 增加20%权重
            }
          }
          
          // 惩罚项4：如果这个数字在最近几期出现过，出现的概率高，应该降低权重
          const recentWindow = history.slice(-Math.min(rows, 5));
          if (recentWindow.some(row => row.includes(num))) {
            weight *= 0.6; // 最近出现过，权重降低40%
          }
          
          // 最终权重调整：使用平方根缩放，降低极端值的影响
          const adjustedWeight = Math.sqrt(weight) * 0.85;
          
          if (adjustedWeight > 0.3) { // 只保留权重足够高的候选
            candidates.push({
              num,
              method,
              position: pos + 1,
              unmatchedRate,
              mlScore, // 新增：机器学习分数
              isLowMatchMethod, // 新增：是否来自低匹配率算法
              weight: adjustedWeight,
              predictionCount: predictionCountForNum,
            });
          }
        }
      });
    });

    // 去重：同一个数字只保留权重最高的
    const uniqueCandidates = {};
    candidates.forEach((item) => {
      if (!uniqueCandidates[item.num] || uniqueCandidates[item.num].weight < item.weight) {
        uniqueCandidates[item.num] = item;
      } else if (uniqueCandidates[item.num].weight === item.weight) {
        // 如果权重相同，合并来源
        if (!uniqueCandidates[item.num].sources) {
          uniqueCandidates[item.num].sources = [
            { method: uniqueCandidates[item.num].method, position: uniqueCandidates[item.num].position },
          ];
        }
        uniqueCandidates[item.num].sources.push({ method: item.method, position: item.position });
      }
    });

    // 如果候选数字不足10个，从概率性分析中补充
    // 概率性分析：选择那些在所有算法中都不常出现，且历史频率低的数字
    if (Object.keys(uniqueCandidates).length < 10) {
      const allNumbers = Array.from({ length: 49 }, (_, i) => i + 1);
      const probabilityScores = {};
      
      allNumbers.forEach((num) => {
        // 如果已经在候选列表中，跳过
        if (uniqueCandidates[num]) return;
        
        // 计算这个数字的概率性不出现分数
        let probScore = 0;
        
        // 1. 历史频率（越低越好）
        const freq = history.flat().filter((n) => n === num).length;
        const freqScore = 1 - freq / (rows * 7);
        probScore += freqScore * 0.3;
        
        // 2. 最近出现时间（越久越好）
        let lastSeen = rows;
        for (let i = rows - 1; i >= 0; i--) {
          if (history[i].includes(num)) {
            lastSeen = rows - 1 - i;
            break;
          }
        }
        const recencyScore = lastSeen / rows;
        probScore += recencyScore * 0.3;
        
        // 3. 是否被多个算法预测（如果被预测，说明出现的概率高，应该降低分数）
        const predCount = predictionCount[num] || 0;
        if (predCount > 0) {
          probScore *= (1 - predCount * 0.2); // 每被一个算法预测，分数降低20%
        }
        
        // 4. 是否是热号（热号出现的概率高）
        if (hotCold.hot.includes(num)) {
          probScore *= 0.4; // 热号分数大幅降低
        }
        
        // 5. 是否是冷号（冷号出现的概率低）
        if (hotCold.cold.includes(num)) {
          probScore *= 1.3; // 冷号分数增加
        }
        
        // 6. 最近几期是否出现过
        const recentWindow = history.slice(-Math.min(rows, 5));
        if (recentWindow.some(row => row.includes(num))) {
          probScore *= 0.5; // 最近出现过，分数降低
        }
        
        if (probScore > 0.3) {
          probabilityScores[num] = probScore;
        }
      });
      
      // 将概率性分析的数字加入候选（按分数排序）
      Object.keys(probabilityScores)
        .sort((a, b) => probabilityScores[b] - probabilityScores[a])
        .slice(0, 10 - Object.keys(uniqueCandidates).length)
        .forEach((num) => {
          uniqueCandidates[parseInt(num)] = {
            num: parseInt(num),
            weight: probabilityScores[num],
            method: '概率分析',
            position: 0,
            sources: [{ method: '概率分析', position: 0 }],
            predictionCount: predictionCount[parseInt(num)] || 0,
            isProbabilityBased: true, // 标记为概率性分析
          };
        });
    }

    // 按权重降序排序，取前10个
    const selected = Object.values(uniqueCandidates)
      .map((item) => ({
        num: item.num,
        weight: item.weight,
        method: item.method,
        position: item.position,
        sources: item.sources || [{ method: item.method, position: item.position }],
        predictionCount: item.predictionCount || 0,
        mlScore: item.mlScore, // 机器学习分数
        isLowMatchMethod: item.isLowMatchMethod, // 是否来自低匹配率算法
        isProbabilityBased: item.isProbabilityBased, // 是否来自概率性分析
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    return selected;
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedNumbers && selectedNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "8px", border: "2px solid #007bff" }}>
          <h3 style={{ marginTop: 0, color: "#007bff" }}>
            🎯 根据统计概率从当前算法中挑选的10个数字
          </h3>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {selectedNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: idx < 3 ? "#fff3cd" : idx < 6 ? "#d1ecf1" : "#e7f3ff",
                    border: `2px solid ${idx < 3 ? "#ffc107" : idx < 6 ? "#17a2b8" : "#2196F3"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                    minWidth: "120px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "6px" }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    不出现概率: {(item.weight * 100).toFixed(1)}%
                  </div>
                  {item.mlScore !== undefined && item.mlScore > 0 && (
                    <div style={{ fontSize: "10px", color: "#9c27b0", marginBottom: "4px" }}>
                      🤖 ML预测: {(item.mlScore * 100).toFixed(1)}%
                    </div>
                  )}
                  {item.isLowMatchMethod && (
                    <div style={{ fontSize: "10px", color: "#ff9800", marginBottom: "4px" }}>
                      ⭐ 低匹配率算法
                    </div>
                  )}
                  {item.isProbabilityBased && (
                    <div style={{ fontSize: "10px", color: "#4caf50", marginBottom: "4px" }}>
                      📊 概率性分析
                    </div>
                  )}
                  {item.predictionCount !== undefined && (
                    <div style={{ fontSize: "10px", color: "#ff6b6b", marginBottom: "4px" }}>
                      {item.predictionCount > 1 ? `⚠️ 被${item.predictionCount}个算法预测` : "✓ 仅1个算法预测"}
                    </div>
                  )}
                  <div style={{ fontSize: "10px", color: "#888" }}>
                    {item.sources.map((s, i) => (
                      <span key={i}>
                        {s.method}{s.position > 0 ? `第${s.position}位` : ''}
                        {i < item.sources.length - 1 && " / "}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#e7f3ff", borderRadius: "6px", fontSize: "13px" }}>
            <strong>说明（机器学习增强版算法）：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.8" }}>
              <li>这10个数字是从当前算法的预测结果中，结合机器学习方式智能挑选出来的。</li>
              <li><strong>不出现概率</strong>：综合考虑历史不匹配率、机器学习预测、算法预测次数、热冷号等因素计算得出。</li>
              <li><strong>🤖 ML预测</strong>：机器学习模型分析历史中只匹配1-2个数字的算法，学习哪些数字更可能不出现。</li>
              <li><strong>⭐ 低匹配率算法</strong>：这些数字来自历史中经常只匹配1-2个数字的算法，更可能不出现。</li>
              <li><strong>📊 概率性分析</strong>：如果候选不足10个，会从概率性分析中补充（基于历史频率、冷号等）。</li>
              <li><strong>算法预测次数</strong>：如果被多个算法预测（显示⚠️），说明出现的概率反而高，已降低权重。</li>
              <li>数字越大（不出现概率越高），表示该数字在下一行中出现的可能性越低。</li>
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

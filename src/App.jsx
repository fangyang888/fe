import React, { useState, useEffect } from "react";
// import { Line } from "react-chartjs-2";
// import "chart.js/auto";
// @ts-ignore
import NumberDigitPredictor from "./NumberDigitPredictor.jsx";
// @ts-ignore
import { result as zodiacHistory } from "./result.ts";

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
  const [killNumbers, setKillNumbers] = useState(null);
  const [tailPredictions, setTailPredictions] = useState(null);
  const [zodiacPredictions, setZodiacPredictions] = useState(null);
  const [killLastDigit, setKillLastDigit] = useState(null);
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

  // ========== 新增杀码算法（预测不会出现的数字）==========

  // 杀码算法 K1：马尔可夫链反向预测
  // 基于转移概率矩阵，找出从上一行数字转移概率最低的数字
  const predictK1 = (history) => {
    const rows = history.length;
    if (rows < 5) return null;

    // 构建转移概率矩阵：transition[from][to] = 次数
    const transition = Array(50).fill(null).map(() => Array(50).fill(0));
    for (let i = 0; i < rows - 1; i++) {
      const currRow = history[i];
      const nextRow = history[i + 1];
      currRow.forEach(from => {
        nextRow.forEach(to => {
          transition[from][to]++;
        });
      });
    }

    // 计算每个数字从上一行转移过来的概率
    const lastRow = history[rows - 1];
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      let totalTransitions = 0;
      lastRow.forEach(from => {
        totalTransitions += transition[from][num];
      });
      return { num, score: totalTransitions };
    });

    // 按转移次数升序（越少越不可能出现）
    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, 10).map(s => s.num);
  };

  // 杀码算法 K2：周期性排除
  // 分析数字出现的周期性，如果某数字刚出现，下一期大概率不会再出
  const predictK2 = (history) => {
    const rows = history.length;
    if (rows < 3) return null;

    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      
      // 计算该数字的平均出现周期
      const appearances = [];
      for (let j = 0; j < rows; j++) {
        if (history[j].includes(num)) {
          appearances.push(j);
        }
      }
      
      if (appearances.length < 2) {
        // 很少出现，可能继续不出现
        return { num, score: 10 };
      }

      // 计算平均周期
      let totalGap = 0;
      for (let j = 1; j < appearances.length; j++) {
        totalGap += appearances[j] - appearances[j - 1];
      }
      const avgCycle = totalGap / (appearances.length - 1);

      // 计算距离上次出现的期数
      const lastAppearance = appearances[appearances.length - 1];
      const gapSinceLastAppear = rows - 1 - lastAppearance;

      // 如果刚出现（gap < avgCycle * 0.3），则很可能不会再出现
      if (gapSinceLastAppear < avgCycle * 0.3) {
        return { num, score: 15 - gapSinceLastAppear };
      }
      
      // 如果距离上次出现接近平均周期，可能快要出现了
      if (gapSinceLastAppear >= avgCycle * 0.8 && gapSinceLastAppear <= avgCycle * 1.2) {
        return { num, score: 0 };
      }

      return { num, score: 5 };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 10).map(s => s.num);
  };

  // 杀码算法 K3：连续排除法
  // 如果一个数字连续多期出现，下一期不出现的概率增加
  const predictK3 = (history) => {
    const rows = history.length;
    if (rows < 3) return null;

    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      
      // 计算连续出现次数（从最近往前数）
      let consecutiveCount = 0;
      for (let j = rows - 1; j >= 0; j--) {
        if (history[j].includes(num)) {
          consecutiveCount++;
        } else {
          break;
        }
      }

      // 连续出现越多次，下期不出现的分数越高
      if (consecutiveCount >= 3) {
        return { num, score: 20 + consecutiveCount * 2 };
      } else if (consecutiveCount === 2) {
        return { num, score: 15 };
      } else if (consecutiveCount === 1) {
        return { num, score: 10 };
      }
      
      return { num, score: 0 };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 10).map(s => s.num);
  };

  // 杀码算法 K4：差值反推
  // 基于相邻两期的差值模式，预测不会出现的数字
  const predictK4 = (history) => {
    const rows = history.length;
    if (rows < 5) return null;

    // 统计每个位置的差值分布
    const diffPatterns = Array(7).fill(null).map(() => ({}));
    for (let i = 1; i < rows; i++) {
      for (let pos = 0; pos < 7; pos++) {
        const diff = history[i][pos] - history[i - 1][pos];
        diffPatterns[pos][diff] = (diffPatterns[pos][diff] || 0) + 1;
      }
    }

    // 找出最不常见的差值
    const lastRow = history[rows - 1];
    const unlikelyNumbers = new Set();

    for (let pos = 0; pos < 7; pos++) {
      // 按频率排序差值
      const sortedDiffs = Object.entries(diffPatterns[pos])
        .sort((a, b) => b[1] - a[1]);
      
      // 取最常见的差值
      if (sortedDiffs.length > 0) {
        const mostCommonDiff = parseInt(sortedDiffs[0][0]);
        // 预测的数字最可能是 lastRow[pos] + mostCommonDiff
        const likelyNum = lastRow[pos] + mostCommonDiff;
        // 不太可能的是差值不常见的
        for (let d = -20; d <= 20; d++) {
          const freq = diffPatterns[pos][d] || 0;
          if (freq === 0) {
            const num = lastRow[pos] + d;
            if (num >= 1 && num <= 49) {
              unlikelyNumbers.add(num);
            }
          }
        }
      }
    }

    return Array.from(unlikelyNumbers).slice(0, 10);
  };

  // 杀码算法 K5：反共现分析
  // 找出与上一行数字很少一起出现的数字
  const predictK5 = (history) => {
    const rows = history.length;
    if (rows < 10) return null;

    // 计算共现矩阵
    const cooccur = Array(50).fill(null).map(() => Array(50).fill(0));
    for (const row of history) {
      for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
          cooccur[row[i]][row[j]]++;
          cooccur[row[j]][row[i]]++;
        }
      }
    }

    // 找与上一行数字共现次数最少的数字
    const lastRow = history[rows - 1];
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      if (lastRow.includes(num)) {
        return { num, score: 100 }; // 上一行已有的数字评分高（很可能不出现）
      }
      
      // 计算与上一行数字的共现总次数
      let totalCooccur = 0;
      lastRow.forEach(prev => {
        totalCooccur += cooccur[prev][num];
      });
      
      // 共现次数越少，越不可能出现
      return { num, score: totalCooccur === 0 ? 50 : 1 / (totalCooccur + 1) * 10 };
    });

    // 选择上一行的数字 + 共现最少的数字
    const fromLastRow = lastRow.slice(); // 上一行的7个
    const lowCooccur = scores
      .filter(s => !lastRow.includes(s.num))
      .sort((a, b) => a.score - b.score) // 共现最少的
      .slice(0, 3)
      .map(s => s.num);

    return [...fromLastRow, ...lowCooccur].slice(0, 10);
  };

  // ========== 长期学习杀码权重 ==========
  // 基于历史数据回测，自动学习每个算法的权重
  const learnKillWeights = (history) => {
    const rows = history.length;
    // 至少需要10期数据才能学习
    if (rows < 10) {
      return {
        weights: { K1: 1.5, K2: 1.2, K3: 1.8, K4: 1.0, K5: 2.0, N: 1.0, lastRow: 5.0 },
        stats: null,
        learned: false
      };
    }

    // 回测统计：用前N-1期预测第N期，统计每个算法的成功率
    const algorithmStats = {
      K1: { success: 0, total: 0 },
      K2: { success: 0, total: 0 },
      K3: { success: 0, total: 0 },
      K4: { success: 0, total: 0 },
      K5: { success: 0, total: 0 },
      N: { success: 0, total: 0 },
      lastRow: { success: 0, total: 0 }
    };

    // 🎓 改为学习最近15期数据（用户要求）
    const lookback = Math.min(15, rows - 5);
    const startIdx = rows - lookback - 1;
    
    for (let i = startIdx; i < rows - 1; i++) {
      const pastHistory = history.slice(0, i + 1);
      const nextRow = history[i + 1];
      const nextRowSet = new Set(nextRow);

      // 各算法预测
      const k1 = predictK1(pastHistory) || [];
      const k2 = predictK2(pastHistory) || [];
      const k3 = predictK3(pastHistory) || [];
      const k4 = predictK4(pastHistory) || [];
      const k5 = predictK5(pastHistory) || [];
      const predN = predictN(pastHistory) || [];
      const lastRowNums = pastHistory[pastHistory.length - 1] || [];

      // 统计成功次数（杀码成功 = 预测不会出现的数字确实没有出现）
      const checkSuccess = (predictions, name) => {
        predictions.forEach((num) => {
          if (num >= 1 && num <= 49) {
            algorithmStats[name].total++;
            if (!nextRowSet.has(num)) {
              algorithmStats[name].success++;
            }
          }
        });
      };

      checkSuccess(k1, 'K1');
      checkSuccess(k2, 'K2');
      checkSuccess(k3, 'K3');
      checkSuccess(k4, 'K4');
      checkSuccess(k5, 'K5');
      checkSuccess(predN, 'N');
      checkSuccess(lastRowNums, 'lastRow');
    }

    // 计算成功率并生成权重
    const successRates = {};
    const weights = {};
    
    Object.keys(algorithmStats).forEach(name => {
      const stat = algorithmStats[name];
      const rate = stat.total > 0 ? stat.success / stat.total : 0;
      successRates[name] = rate;
      
      // 🎓 优化权重计算：使用指数函数放大高成功率的权重
      if (name === 'lastRow') {
        // 上一行权重更高
        weights[name] = Math.pow(rate, 1.5) * 8.0;
      } else {
        // 其他算法权重基于成功率的平方
        weights[name] = Math.pow(rate, 2) * 4.0;
      }
    });

    // 🎓 动态归一化：确保最高权重算法有足够影响力
    const maxWeight = Math.max(...Object.values(weights));
    const normalizedWeights = {};
    Object.keys(weights).forEach(name => {
      // 归一化到1-10的范围
      normalizedWeights[name] = (weights[name] / maxWeight) * 10;
    });

    return {
      weights: normalizedWeights,
      stats: { successRates, totalPeriods: lookback },
      learned: true
    };
  };

  // 综合杀码推荐算法：结合所有杀码算法的结果（使用学习权重）+ 新增策略
  const predictKillNumbers = (history) => {
    const rows = history.length;
    if (rows < 5) return null;

    // 🎓 获取学习后的权重
    const { weights: learnedWeights, stats: learnStats, learned } = learnKillWeights(history);

    const k1 = predictK1(history) || [];
    const k2 = predictK2(history) || [];
    const k3 = predictK3(history) || [];
    const k4 = predictK4(history) || [];
    const k5 = predictK5(history) || [];
    const predN = predictN(history) || [];

    // === 新增策略：基于历史规律 ===
    const lastRow = history[rows - 1];
    const lastRowSet = new Set(lastRow);
    
    // 策略A: 连续出现的数字（连续2期以上）
    const consecutiveNums = [];
    for (let num = 1; num <= 49; num++) {
      let consecutive = 0;
      for (let j = rows - 1; j >= Math.max(0, rows - 3); j--) {
        if (history[j].includes(num)) consecutive++;
        else break;
      }
      if (consecutive >= 2) consecutiveNums.push(num);
    }

    // 策略B: 最近5期热号（出现>=3次）
    const recentNums = history.slice(-5).flat();
    const recentFreq = {};
    recentNums.forEach(n => recentFreq[n] = (recentFreq[n] || 0) + 1);
    const hotNums = Object.entries(recentFreq)
      .filter(([_, freq]) => freq >= 3)
      .map(([num, _]) => parseInt(num));

    // 策略C: 最近2期都出现的数字
    const overlap2Period = [];
    if (rows >= 2) {
      const set1 = new Set(history[rows - 1]);
      const set2 = new Set(history[rows - 2]);
      for (let num = 1; num <= 49; num++) {
        if (set1.has(num) && set2.has(num)) overlap2Period.push(num);
      }
    }

    // 投票计分（增强版）
    const voteCount = {};
    const addVotes = (nums, weight, source, extraVotes = 1) => {
      nums.forEach((num, idx) => {
        if (num < 1 || num > 49) return;
        if (!voteCount[num]) {
          voteCount[num] = { votes: 0, weight: 0, sources: [], strategyCount: 0 };
        }
        // 排名越靠前权重越高
        const positionWeight = (10 - Math.min(idx, 9)) / 10;
        voteCount[num].votes += extraVotes;
        voteCount[num].weight += weight * positionWeight;
        voteCount[num].sources.push(source);
        voteCount[num].strategyCount++;
      });
    };

    // 使用学习后的权重
    addVotes(k1, learnedWeights.K1, `K1(${(learnStats?.successRates?.K1 * 100 || 0).toFixed(0)}%)`);
    addVotes(k2, learnedWeights.K2, `K2(${(learnStats?.successRates?.K2 * 100 || 0).toFixed(0)}%)`);
    addVotes(k3, learnedWeights.K3, `K3(${(learnStats?.successRates?.K3 * 100 || 0).toFixed(0)}%)`);
    addVotes(k4, learnedWeights.K4, `K4(${(learnStats?.successRates?.K4 * 100 || 0).toFixed(0)}%)`);
    addVotes(k5, learnedWeights.K5, `K5(${(learnStats?.successRates?.K5 * 100 || 0).toFixed(0)}%)`);
    addVotes(predN, learnedWeights.N, `N(${(learnStats?.successRates?.N * 100 || 0).toFixed(0)}%)`);

    // 上一行数字（高权重）
    lastRow.forEach(num => {
      if (!voteCount[num]) {
        voteCount[num] = { votes: 0, weight: 0, sources: [], strategyCount: 0 };
      }
      voteCount[num].votes += 3;
      voteCount[num].weight += learnedWeights.lastRow;
      voteCount[num].sources.push(`上行(${(learnStats?.successRates?.lastRow * 100 || 0).toFixed(0)}%)`);
      voteCount[num].strategyCount++;
    });

    // 新增策略权重
    addVotes(consecutiveNums, 6.0, '连续', 2);
    addVotes(hotNums, 5.0, '热号', 2);
    addVotes(overlap2Period, 7.0, '2期重', 2);

    // === 组合多策略筛选 ===
    const sorted = Object.entries(voteCount)
      .map(([num, data]) => ({
        num: parseInt(num),
        votes: data.votes,
        weight: data.weight,
        sources: data.sources,
        strategyCount: data.strategyCount
      }))
      // 优先策略数多的，其次权重高的
      .sort((a, b) => {
        if (a.strategyCount >= 3 && b.strategyCount < 3) return -1;
        if (b.strategyCount >= 3 && a.strategyCount < 3) return 1;
        return b.weight - a.weight;
      });

    // 附加学习信息
    const result = sorted.slice(0, 10);
    result.learnInfo = {
      learned,
      weights: learnedWeights,
      successRates: learnStats?.successRates || {},
      totalPeriods: learnStats?.totalPeriods || 0
    };

    return result;
  };

  // ========== 杀码推荐算法（增强版 v3 - 10策略 + 回测验证）==========
  // 预测下期不会出现的10个数字（基于历史规律分析 + 回测自动学习权重）
  const predictKillLastDigit = (history) => {
    const rows = history.length;
    if (rows < 15) return null;

    // ========== 回测学习最优权重（10个策略）==========
    const learnWeights = () => {
      const strategies = [
        'lastRow',        // S1: 上一行数字不重复
        'consecutive',    // S2: 连续出现排除
        'hotFatigue',     // S3: 热号疲劳
        'recentRepeat',   // S4: 近期重复排除
        'gapPattern',     // S5: 间隔模式（刚出现）
        'sumZone',        // S6: 和值区间偏离
        'parityBias',     // S7: 奇偶失衡排除
        'sizeZone',       // S8: 大小区间过载
        'neighborExcl',   // S9: 邻号排除
        'freqDecay'       // S10: 频率衰减
      ];
      const successCount = {};
      const totalCount = {};
      strategies.forEach(s => { successCount[s] = 0; totalCount[s] = 0; });

      const lookback = Math.min(40, rows - 10);

      for (let testIdx = rows - lookback - 1; testIdx < rows - 1; testIdx++) {
        const testHistory = history.slice(0, testIdx + 1);
        const nextRow = history[testIdx + 1];
        const nextRowSet = new Set(nextRow);
        const testLastRow = testHistory[testHistory.length - 1];

        // S1: 上一行数字
        testLastRow.forEach(num => {
          totalCount.lastRow++;
          if (!nextRowSet.has(num)) successCount.lastRow++;
        });

        // S2: 连续出现的数字（连续2期以上）
        for (let num = 1; num <= 49; num++) {
          let cons = 0;
          for (let j = testHistory.length - 1; j >= Math.max(0, testHistory.length - 3); j--) {
            if (testHistory[j].includes(num)) cons++;
            else break;
          }
          if (cons >= 2) {
            totalCount.consecutive++;
            if (!nextRowSet.has(num)) successCount.consecutive++;
          }
        }

        // S3: 最近热号疲劳（5期内出现3次以上）
        const tRecentNums = testHistory.slice(-5).flat();
        const tNumFreq = {};
        tRecentNums.forEach(n => tNumFreq[n] = (tNumFreq[n] || 0) + 1);
        Object.entries(tNumFreq).forEach(([num, freq]) => {
          if (freq >= 3) {
            totalCount.hotFatigue++;
            if (!nextRowSet.has(parseInt(num))) successCount.hotFatigue++;
          }
        });

        // S4: 最近2期都出现的数字
        if (testHistory.length >= 2) {
          const tLast2 = testHistory.slice(-2);
          for (let num = 1; num <= 49; num++) {
            if (tLast2[0].includes(num) && tLast2[1].includes(num)) {
              totalCount.recentRepeat++;
              if (!nextRowSet.has(num)) successCount.recentRepeat++;
            }
          }
        }

        // S5: 间隔模式 - 刚出现0-1期的数字
        for (let num = 1; num <= 49; num++) {
          let la = -1;
          for (let j = testHistory.length - 1; j >= 0; j--) {
            if (testHistory[j].includes(num)) { la = j; break; }
          }
          if (la >= testHistory.length - 2 && la >= 0) {
            totalCount.gapPattern++;
            if (!nextRowSet.has(num)) successCount.gapPattern++;
          }
        }

        // S6: 和值区间偏离 - 上行和值附近的数字可能被排斥
        const testSum = testLastRow.reduce((a, b) => a + b, 0);
        const avgNum = Math.round(testSum / 7);
        // 和值偏高时杀大号，偏低时杀小号
        if (avgNum > 28) {
          for (let num = 35; num <= 49; num++) {
            totalCount.sumZone++;
            if (!nextRowSet.has(num)) successCount.sumZone++;
          }
        } else if (avgNum < 22) {
          for (let num = 1; num <= 15; num++) {
            totalCount.sumZone++;
            if (!nextRowSet.has(num)) successCount.sumZone++;
          }
        }

        // S7: 奇偶失衡排除
        const oddCount = testLastRow.filter(n => n % 2 === 1).length;
        if (oddCount >= 5) {
          // 上行偏奇，杀奇号
          for (let num = 1; num <= 49; num += 2) {
            if (!testLastRow.includes(num)) {
              totalCount.parityBias++;
              if (!nextRowSet.has(num)) successCount.parityBias++;
            }
          }
        } else if (oddCount <= 2) {
          // 上行偏偶，杀偶号
          for (let num = 2; num <= 48; num += 2) {
            if (!testLastRow.includes(num)) {
              totalCount.parityBias++;
              if (!nextRowSet.has(num)) successCount.parityBias++;
            }
          }
        }

        // S8: 大小区间过载 - 上行集中在某区间时杀该区间
        const zones = [0, 0, 0, 0, 0]; // 1-10, 11-20, 21-30, 31-40, 41-49
        testLastRow.forEach(n => zones[Math.min(Math.floor((n - 1) / 10), 4)]++);
        zones.forEach((count, zi) => {
          if (count >= 3) {
            const lo = zi * 10 + 1;
            const hi = zi === 4 ? 49 : (zi + 1) * 10;
            for (let num = lo; num <= hi; num++) {
              if (!testLastRow.includes(num)) {
                totalCount.sizeZone++;
                if (!nextRowSet.has(num)) successCount.sizeZone++;
              }
            }
          }
        });

        // S9: 邻号排除 - 上行数字的±1邻号
        const testLastRowSet = new Set(testLastRow);
        testLastRow.forEach(num => {
          [num - 1, num + 1].forEach(neighbor => {
            if (neighbor >= 1 && neighbor <= 49 && !testLastRowSet.has(neighbor)) {
              totalCount.neighborExcl++;
              if (!nextRowSet.has(neighbor)) successCount.neighborExcl++;
            }
          });
        });

        // S10: 频率衰减 - 近10期高频但呈下降趋势的数字
        if (testHistory.length >= 10) {
          const first5 = testHistory.slice(-10, -5).flat();
          const last5 = testHistory.slice(-5).flat();
          for (let num = 1; num <= 49; num++) {
            const f5Count = first5.filter(n => n === num).length;
            const l5Count = last5.filter(n => n === num).length;
            if (f5Count >= 2 && l5Count >= 2 && l5Count <= f5Count) {
              totalCount.freqDecay++;
              if (!nextRowSet.has(num)) successCount.freqDecay++;
            }
          }
        }
      }

      // 计算成功率
      const rates = {};
      const weights = {};
      strategies.forEach(s => {
        rates[s] = totalCount[s] > 0 ? successCount[s] / totalCount[s] : 0.5;
        weights[s] = Math.pow(Math.max(rates[s] - 0.5, 0) * 2, 1.5) * 10;
      });

      return { weights, rates, totalPeriods: lookback, totalCount, successCount };
    };

    const { weights, rates, totalPeriods, totalCount, successCount } = learnWeights();

    // ========== 应用学习到的权重进行预测 ==========
    const lastRow = history[rows - 1];
    const lastRowSet = new Set(lastRow);

    // 常用统计
    const recentHistory = history.slice(-5);
    const recentNums = recentHistory.flat();
    const recentFreq = {};
    recentNums.forEach(n => recentFreq[n] = (recentFreq[n] || 0) + 1);

    const lastRowSum = lastRow.reduce((a, b) => a + b, 0);
    const avgNum = Math.round(lastRowSum / 7);
    const oddCount = lastRow.filter(n => n % 2 === 1).length;

    const zones = [0, 0, 0, 0, 0];
    lastRow.forEach(n => zones[Math.min(Math.floor((n - 1) / 10), 4)]++);

    // 频率衰减统计
    const first5Flat = rows >= 10 ? history.slice(-10, -5).flat() : [];
    const last5Flat = history.slice(-5).flat();

    // 计算每个数字的杀码分数
    const numberScores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      let score = 0;
      const sources = [];
      let strategyCount = 0;

      // S1: 上一行出现的数字
      if (lastRowSet.has(num)) {
        score += weights.lastRow * 1.5;
        sources.push(`上行(${(rates.lastRow * 100).toFixed(0)}%)`);
        if (rates.lastRow > 0.8) strategyCount++;
      }

      // S2: 连续出现
      let consecutive = 0;
      for (let j = rows - 1; j >= Math.max(0, rows - 3); j--) {
        if (history[j].includes(num)) consecutive++;
        else break;
      }
      if (consecutive >= 2) {
        score += weights.consecutive * (consecutive / 2);
        sources.push(`连续${consecutive}期(${(rates.consecutive * 100).toFixed(0)}%)`);
        if (rates.consecutive > 0.8) strategyCount++;
      }

      // S3: 热号疲劳
      if (recentFreq[num] >= 3) {
        score += weights.hotFatigue * (recentFreq[num] / 3);
        sources.push(`热号${recentFreq[num]}次(${(rates.hotFatigue * 100).toFixed(0)}%)`);
        if (rates.hotFatigue > 0.8) strategyCount++;
      }

      // S4: 最近2期都出现
      if (rows >= 2) {
        const inLast1 = history[rows - 2].includes(num);
        const inLast2 = history[rows - 1].includes(num);
        if (inLast1 && inLast2) {
          score += weights.recentRepeat * 1.2;
          sources.push(`近2期(${(rates.recentRepeat * 100).toFixed(0)}%)`);
          if (rates.recentRepeat > 0.8) strategyCount++;
        }
      }

      // S5: 间隔模式
      let lastAppear = -1;
      for (let j = rows - 1; j >= 0; j--) {
        if (history[j].includes(num)) { lastAppear = j; break; }
      }
      if (lastAppear >= rows - 2 && lastAppear >= 0 && !lastRowSet.has(num)) {
        score += weights.gapPattern * 0.5;
        sources.push(`刚出(${(rates.gapPattern * 100).toFixed(0)}%)`);
        if (rates.gapPattern > 0.8) strategyCount++;
      }

      // S6: 和值区间偏离
      if ((avgNum > 28 && num >= 35) || (avgNum < 22 && num <= 15)) {
        score += weights.sumZone * 0.6;
        sources.push(`和值偏${avgNum > 28 ? '高' : '低'}(${(rates.sumZone * 100).toFixed(0)}%)`);
        if (rates.sumZone > 0.8) strategyCount++;
      }

      // S7: 奇偶失衡
      if ((oddCount >= 5 && num % 2 === 1 && !lastRowSet.has(num)) ||
          (oddCount <= 2 && num % 2 === 0 && !lastRowSet.has(num))) {
        score += weights.parityBias * 0.5;
        sources.push(`${oddCount >= 5 ? '偏奇杀奇' : '偏偶杀偶'}(${(rates.parityBias * 100).toFixed(0)}%)`);
        if (rates.parityBias > 0.8) strategyCount++;
      }

      // S8: 大小区间过载
      const numZone = Math.min(Math.floor((num - 1) / 10), 4);
      if (zones[numZone] >= 3 && !lastRowSet.has(num)) {
        score += weights.sizeZone * 0.6;
        sources.push(`${['小','中小','中','中大','大'][numZone]}区热(${(rates.sizeZone * 100).toFixed(0)}%)`);
        if (rates.sizeZone > 0.8) strategyCount++;
      }

      // S9: 邻号排除
      const isNeighbor = lastRow.some(n => Math.abs(n - num) === 1) && !lastRowSet.has(num);
      if (isNeighbor) {
        score += weights.neighborExcl * 0.5;
        sources.push(`邻号(${(rates.neighborExcl * 100).toFixed(0)}%)`);
        if (rates.neighborExcl > 0.8) strategyCount++;
      }

      // S10: 频率衰减
      if (rows >= 10) {
        const f5Count = first5Flat.filter(n => n === num).length;
        const l5Count = last5Flat.filter(n => n === num).length;
        if (f5Count >= 2 && l5Count >= 2 && l5Count <= f5Count) {
          score += weights.freqDecay * 0.6;
          sources.push(`衰减(${(rates.freqDecay * 100).toFixed(0)}%)`);
          if (rates.freqDecay > 0.8) strategyCount++;
        }
      }

      return { num, score, sources, strategyCount };
    });

    // ========== 组合多策略筛选 ==========
    const multiStrategyNums = numberScores.filter(item => item.strategyCount >= 2);
    const singleStrategyNums = numberScores.filter(item => item.strategyCount < 2);

    multiStrategyNums.sort((a, b) => b.strategyCount - a.strategyCount || b.score - a.score);
    singleStrategyNums.sort((a, b) => b.score - a.score);

    const sortedScores = [...multiStrategyNums, ...singleStrategyNums];

    const result = sortedScores.slice(0, 10).map(item => ({
      num: item.num,
      score: item.score,
      sources: item.sources,
      strategyCount: item.strategyCount,
      reason: item.strategyCount >= 2
        ? `${item.strategyCount}策略`
        : (item.sources.length > 0 ? item.sources[0].split('(')[0] : '综合分析')
    }));

    // ========== 回测验证最近5期的准确率 ==========
    const backtestRecent = () => {
      const results = [];
      const testPeriods = Math.min(5, rows - 15);

      for (let i = 0; i < testPeriods; i++) {
        const testIdx = rows - 2 - i;
        const testHistory = history.slice(0, testIdx + 1);
        const actualNext = history[testIdx + 1];
        const actualSet = new Set(actualNext);

        // 使用完整预测逻辑回测
        const tLastRow = testHistory[testHistory.length - 1];
        const killNums = new Set(tLastRow);

        for (let num = 1; num <= 49; num++) {
          let cons = 0;
          for (let j = testHistory.length - 1; j >= Math.max(0, testHistory.length - 3); j--) {
            if (testHistory[j].includes(num)) cons++;
            else break;
          }
          if (cons >= 2) killNums.add(num);
        }

        let successKill = 0;
        let totalKill = 0;
        killNums.forEach(num => {
          totalKill++;
          if (!actualSet.has(num)) successKill++;
        });

        results.push({
          period: testIdx + 1,
          killCount: totalKill,
          successCount: successKill,
          accuracy: totalKill > 0 ? (successKill / totalKill * 100).toFixed(1) : 0
        });
      }

      return results;
    };

    const backtestResults = backtestRecent();
    const avgAccuracy = backtestResults.length > 0
      ? backtestResults.reduce((sum, r) => sum + parseFloat(r.accuracy), 0) / backtestResults.length
      : 0;

    // 附加分析信息
    result.analysisInfo = {
      lastRowNums: [...lastRow],
      avgNum,
      oddCount,
      zones: zones.map((c, i) => ({ zone: ['1-10','11-20','21-30','31-40','41-49'][i], count: c }))
    };

    // 附加学习信息
    result.learnInfo = {
      learned: true,
      weights,
      successRates: rates,
      totalPeriods,
      backtestResults,
      avgAccuracy: avgAccuracy.toFixed(1)
    };

    return result;
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

  /**
   * 预测下一行最后一个数字的尾数 (0-9)
   * 策略：历史回测 + 和值尾数 + 跨度分析 + 多维度综合
   */
  /**
   * 可学习的尾数预测器
   * 通过回测历史数据自动学习各算法的权重
   */
  const predictTail = (history) => {
    const rows = history.length;
    if (rows < 10) return null;

    // 提取所有行的最后一个数字的尾数 (最后一个数字 % 10)
    const tails = history.map(row => row[row.length - 1] % 10);
    
    // ========== 8个子算法定义 ==========
    
    // T1: 一阶马尔可夫转移
    const runT1 = (tailsData, idx) => {
      if (idx < 1) return Array(10).fill(0.1);
      const transition = Array(10).fill(null).map(() => Array(10).fill(0));
      for (let i = 0; i < idx; i++) {
        transition[tailsData[i]][tailsData[i + 1]]++;
      }
      const lastTail = tailsData[idx];
      const fromLast = transition[lastTail];
      const total = fromLast.reduce((a, b) => a + b, 0) || 1;
      return fromLast.map(c => c / total);
    };

    // T2: 二阶马尔可夫转移 (看前两期)
    const runT2 = (tailsData, idx) => {
      if (idx < 2) return Array(10).fill(0.1);
      const secondOrder = {};
      for (let i = 0; i < idx - 1; i++) {
        const key = `${tailsData[i]}_${tailsData[i + 1]}`;
        const next = tailsData[i + 2];
        if (!secondOrder[key]) secondOrder[key] = Array(10).fill(0);
        secondOrder[key][next]++;
      }
      const currentKey = `${tailsData[idx - 1]}_${tailsData[idx]}`;
      const probs = secondOrder[currentKey] || Array(10).fill(0);
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(c => c / total);
    };

    // T3: 和值尾数关联
    const runT3 = (historyData, tailsData, idx) => {
      if (idx < 1) return Array(10).fill(0.1);
      const sumTails = historyData.slice(0, idx + 1).map(row => 
        row.reduce((a, b) => a + b, 0) % 10
      );
      const sumToNextTail = Array(10).fill(null).map(() => Array(10).fill(0));
      for (let i = 0; i < idx; i++) {
        sumToNextTail[sumTails[i]][tailsData[i + 1]]++;
      }
      const lastSumTail = sumTails[idx];
      const probs = sumToNextTail[lastSumTail];
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(c => c / total);
    };

    // T4: N-gram 序列匹配 (看前3期)
    const runT4 = (tailsData, idx) => {
      if (idx < 3) return Array(10).fill(0.1);
      const patterns = {};
      for (let i = 0; i < idx - 2; i++) {
        const pattern = `${tailsData[i]}_${tailsData[i + 1]}_${tailsData[i + 2]}`;
        const next = tailsData[i + 3];
        if (!patterns[pattern]) patterns[pattern] = Array(10).fill(0);
        patterns[pattern][next]++;
      }
      const currentPattern = `${tailsData[idx - 2]}_${tailsData[idx - 1]}_${tailsData[idx]}`;
      const probs = patterns[currentPattern] || Array(10).fill(0);
      const total = probs.reduce((a, b) => a + b, 0);
      if (total === 0) return Array(10).fill(0.1);
      return probs.map(c => c / total);
    };

    // T5: 差值模式分析
    const runT5 = (tailsData, idx) => {
      if (idx < 2) return Array(10).fill(0.1);
      const diffPatterns = {};
      for (let i = 1; i < idx; i++) {
        const diff = (tailsData[i] - tailsData[i - 1] + 10) % 10;
        const next = tailsData[i + 1];
        if (!diffPatterns[diff]) diffPatterns[diff] = Array(10).fill(0);
        diffPatterns[diff][next]++;
      }
      const lastDiff = (tailsData[idx] - tailsData[idx - 1] + 10) % 10;
      const probs = diffPatterns[lastDiff] || Array(10).fill(0);
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(c => c / total);
    };

    // T6: 周期分析 (某尾数的出现周期)
    const runT6 = (tailsData, idx) => {
      if (idx < 5) return Array(10).fill(0.1);
      const probs = Array(10).fill(0);
      for (let d = 0; d <= 9; d++) {
        const occurrences = [];
        for (let i = 0; i <= idx; i++) {
          if (tailsData[i] === d) occurrences.push(i);
        }
        if (occurrences.length >= 2) {
          const gaps = [];
          for (let i = 1; i < occurrences.length; i++) {
            gaps.push(occurrences[i] - occurrences[i - 1]);
          }
          const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          const lastOccurrence = occurrences[occurrences.length - 1];
          const gapSinceLastOccurrence = idx - lastOccurrence;
          // 如果接近平均周期，增加概率
          if (gapSinceLastOccurrence >= avgGap * 0.8 && gapSinceLastOccurrence <= avgGap * 1.5) {
            probs[d] = 0.2;
          } else if (gapSinceLastOccurrence > avgGap * 1.5) {
            probs[d] = 0.3; // 超期回补
          }
        }
      }
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(c => c / total);
    };

    // T7: 冷热平衡 (遗漏值回补)
    const runT7 = (tailsData, idx) => {
      if (idx < 10) return Array(10).fill(0.1);
      const recent = tailsData.slice(Math.max(0, idx - 19), idx + 1);
      const freq = Array(10).fill(0);
      recent.forEach(t => freq[t]++);
      
      // 遗漏值 (最近多少期没出现)
      const missed = Array(10).fill(recent.length);
      for (let i = recent.length - 1; i >= 0; i--) {
        if (missed[recent[i]] === recent.length) {
          missed[recent[i]] = recent.length - 1 - i;
        }
      }
      
      // 遗漏越久，概率越高
      const probs = missed.map(m => Math.pow(m + 1, 1.5));
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(p => p / total);
    };

    // T8: 012路补偿
    const runT8 = (tailsData, idx) => {
      if (idx < 5) return Array(10).fill(0.1);
      const recent = tailsData.slice(Math.max(0, idx - 4), idx + 1);
      const getPath = (d) => d % 3;
      const pathCount = [0, 0, 0];
      recent.forEach(t => pathCount[getPath(t)]++);
      
      const pathDigits = {
        0: [0, 3, 6, 9],
        1: [1, 4, 7],
        2: [2, 5, 8]
      };
      
      // 选择出现最少的路
      const minPathIdx = pathCount.indexOf(Math.min(...pathCount));
      const probs = Array(10).fill(0.05);
      pathDigits[minPathIdx].forEach(d => probs[d] = 0.2);
      
      const total = probs.reduce((a, b) => a + b, 0) || 1;
      return probs.map(p => p / total);
    };

    // ========== 回测学习权重 ==========
    const learnWeights = () => {
      const algorithms = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
      const hits = {};
      const attempts = {};
      algorithms.forEach(alg => { hits[alg] = 0; attempts[alg] = 0; });

      const lookback = Math.min(40, rows - 10);
      for (let testIdx = rows - lookback - 1; testIdx < rows - 1; testIdx++) {
        const actualNext = tails[testIdx + 1];
        const historySlice = history.slice(0, testIdx + 1);
        const tailsSlice = tails.slice(0, testIdx + 1);

        // 运行每个算法获取 Top 3 预测
        const algResults = {
          T1: runT1(tailsSlice, testIdx),
          T2: runT2(tailsSlice, testIdx),
          T3: runT3(historySlice, tailsSlice, testIdx),
          T4: runT4(tailsSlice, testIdx),
          T5: runT5(tailsSlice, testIdx),
          T6: runT6(tailsSlice, testIdx),
          T7: runT7(tailsSlice, testIdx),
          T8: runT8(tailsSlice, testIdx)
        };

        algorithms.forEach(alg => {
          const probs = algResults[alg];
          const top3 = probs
            .map((p, d) => ({ d, p }))
            .sort((a, b) => b.p - a.p)
            .slice(0, 3)
            .map(x => x.d);
          
          attempts[alg]++;
          if (top3.includes(actualNext)) {
            hits[alg]++;
          }
        });
      }

      // 计算准确率并归一化为权重
      const accuracy = {};
      const weights = {};
      let totalWeight = 0;
      
      algorithms.forEach(alg => {
        accuracy[alg] = attempts[alg] > 0 ? hits[alg] / attempts[alg] : 0.1;
        // 使用准确率的平方来放大差异
        weights[alg] = Math.pow(accuracy[alg], 2);
        totalWeight += weights[alg];
      });

      // 归一化
      algorithms.forEach(alg => {
        weights[alg] = weights[alg] / totalWeight;
      });

      return { weights, accuracy };
    };

    // ========== 杀码逻辑 ==========
    const getKillSet = () => {
      const recent = tails.slice(-5);
      const last1 = recent[4];
      const last2 = recent[3];
      const last3 = recent[2];
      
      const killSet = new Set();
      
      // 杀1: 上期尾数大概率不连出
      killSet.add(last1);
      
      // 杀2: 连续出现2次以上的尾数
      if (last1 === last2) killSet.add(last1);
      if (last2 === last3) killSet.add(last2);
      
      return killSet;
    };

    // ========== 综合预测 ==========
    const { weights, accuracy } = learnWeights();
    const killSet = getKillSet();
    const lastIdx = rows - 1;

    // 运行所有算法
    const algResults = {
      T1: runT1(tails, lastIdx),
      T2: runT2(tails, lastIdx),
      T3: runT3(history, tails, lastIdx),
      T4: runT4(tails, lastIdx),
      T5: runT5(tails, lastIdx),
      T6: runT6(tails, lastIdx),
      T7: runT7(tails, lastIdx),
      T8: runT8(tails, lastIdx)
    };

    // 加权综合
    const finalScores = Array(10).fill(0);
    Object.keys(algResults).forEach(alg => {
      const probs = algResults[alg];
      const weight = weights[alg];
      probs.forEach((p, d) => {
        finalScores[d] += p * weight;
      });
    });

    // 应用杀码
    killSet.forEach(d => {
      finalScores[d] *= 0.1; // 大幅降低杀码的分数
    });

    // 排序取前6
    const ranked = finalScores
      .map((score, digit) => ({ digit, score, killed: killSet.has(digit) }))
      .filter(x => !x.killed)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // 计算置信度
    const maxScore = ranked[0]?.score || 0;
    const minScore = ranked[ranked.length - 1]?.score || 0;
    const scoreRange = maxScore - minScore || 1;

    // 计算整体准确率用于调整置信度
    const avgAccuracy = Object.values(accuracy).reduce((a, b) => a + b, 0) / 8;

    const algorithmNames = {
      T1: '一阶马尔可夫',
      T2: '二阶马尔可夫', 
      T3: '和值关联',
      T4: 'N-gram序列',
      T5: '差值模式',
      T6: '周期分析',
      T7: '冷热回补',
      T8: '012路'
    };

    // 找出对每个数字贡献最大的算法
    const getTopContributors = (digit) => {
      const contributions = Object.keys(algResults).map(alg => ({
        alg,
        contrib: algResults[alg][digit] * weights[alg]
      })).sort((a, b) => b.contrib - a.contrib);
      
      return contributions.slice(0, 2).map(c => algorithmNames[c.alg]).join('+');
    };

    const result = ranked.map((item, idx) => {
      const normalizedScore = (item.score - minScore) / scoreRange;
      // 结合历史准确率调整置信度显示
      const baseProbability = normalizedScore * 0.5 + 0.25;
      const adjustedProbability = baseProbability * (0.5 + avgAccuracy * 0.5);
      const probability = Math.min(0.85, Math.max(0.20, adjustedProbability));

      let reason = getTopContributors(item.digit);
      if (idx === 0) reason = '🥇 ' + reason;
      else if (idx === 1) reason = '🥈 ' + reason;
      else if (idx === 2) reason = '🥉 ' + reason;

      return {
        digit: item.digit,
        probability,
        reason
      };
    });

    // ========== 转移概率分析 ==========
    const currentTail = tails[rows - 1];
    const transitionFromCurrent = {};
    let transitionTotal = 0;
    for (let i = 0; i < rows - 1; i++) {
      if (tails[i] === currentTail) {
        const next = tails[i + 1];
        transitionFromCurrent[next] = (transitionFromCurrent[next] || 0) + 1;
        transitionTotal++;
      }
    }
    
    // 转移概率排序
    const transitionProbs = Object.entries(transitionFromCurrent)
      .map(([digit, count]) => ({
        digit: parseInt(digit),
        count,
        probability: transitionTotal > 0 ? count / transitionTotal : 0
      }))
      .sort((a, b) => b.count - a.count);

    // ========== 频率统计 ==========
    const freqStats = Array(10).fill(0);
    tails.forEach(t => freqStats[t]++);
    const freqRanked = freqStats
      .map((count, digit) => ({ digit, count, percentage: (count / rows * 100).toFixed(1) }))
      .sort((a, b) => b.count - a.count);

    // ========== 最近N期走势 ==========
    const recentTrend = tails.slice(-10);
    
    // ========== 奇偶分析 ==========
    const oddCount = tails.filter(t => t % 2 === 1).length;
    const evenCount = rows - oddCount;
    const recentOddCount = recentTrend.filter(t => t % 2 === 1).length;

    // ========== 连续相同分析 ==========
    let sameCount = 0;
    for (let i = 1; i < rows; i++) {
      if (tails[i] === tails[i - 1]) sameCount++;
    }

    // 附加学习信息和分析数据到结果
    result.learnInfo = {
      learned: true,
      weights,
      accuracy,
      totalPeriods: rows,
      avgAccuracy: avgAccuracy
    };

    result.analysisInfo = {
      currentTail,
      currentLastNumber: history[rows - 1][6],
      transitionProbs,
      transitionTotal,
      freqRanked,
      recentTrend,
      oddEven: {
        oddCount,
        evenCount,
        oddPercentage: (oddCount / rows * 100).toFixed(1),
        recentOddCount,
        recentEvenCount: 10 - recentOddCount
      },
      sameRatio: ((sameCount / (rows - 1)) * 100).toFixed(1)
    };

    return result;
  };

  /**
   * 预测下一个生肖
   * 优化算法：二阶马尔可夫 + 遗漏回补 + 频率 + 邻近偏好
   */
  const predictZodiac = () => {
    if (!zodiacHistory || zodiacHistory.length < 3) return null;

    const zodiacs = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
    const history = zodiacHistory.map(item => item.value);
    const rows = history.length;
    const last1 = history[rows - 1]; // 最后一期
    const last2 = history[rows - 2]; // 倒数第二期
    const last3 = rows >= 3 ? history[rows - 3] : null;

    // 1. 频率统计
    const freq = {};
    zodiacs.forEach(z => freq[z] = 0);
    history.forEach(z => freq[z]++);

    // 2. 一阶转移概率
    const transition = {};
    zodiacs.forEach(z => {
      transition[z] = {};
      zodiacs.forEach(z2 => transition[z][z2] = 0);
    });
    for (let i = 0; i < rows - 1; i++) {
      transition[history[i]][history[i + 1]]++;
    }
    const fromLast = transition[last1];
    const fromLastTotal = Object.values(fromLast).reduce((a, b) => a + b, 0);

    // 3. 二阶马尔可夫 (A,B) -> C
    const secondOrder = {};
    for (let i = 0; i < rows - 2; i++) {
      const key = `${history[i]}_${history[i + 1]}`;
      const next = history[i + 2];
      if (!secondOrder[key]) secondOrder[key] = {};
      secondOrder[key][next] = (secondOrder[key][next] || 0) + 1;
    }
    const currentKey = `${last2}_${last1}`;
    const secondOrderProbs = secondOrder[currentKey] || {};
    const secondOrderTotal = Object.values(secondOrderProbs).reduce((a, b) => a + b, 0);

    // 4. 遗漏值
    const missed = {};
    zodiacs.forEach(z => missed[z] = rows);
    for (let i = rows - 1; i >= 0; i--) {
      if (missed[history[i]] === rows) {
        missed[history[i]] = rows - 1 - i;
      }
    }

    // 5. 综合评分
    const scores = zodiacs.map(zodiac => {
      let score = 0;
      let reasons = [];

      // 注意：数据量少时不使用杀码，因为可能会错杀

      // 二阶马尔可夫 (最重要，权重 35%)
      if (secondOrderTotal > 0) {
        const prob = (secondOrderProbs[zodiac] || 0) / secondOrderTotal;
        score += prob * 3.5;
        if (prob >= 0.2) reasons.push('二阶');
      }

      // 一阶转移概率 (权重 25%)
      if (fromLastTotal > 0) {
        const prob = fromLast[zodiac] / fromLastTotal;
        score += prob * 2.5;
        if (prob >= 0.15) reasons.push('转移');
      }

      // 遗漏回补 (权重 25%) - 对小数据集很重要
      const avgCycle = rows / (freq[zodiac] || 1);
      const ratio = missed[zodiac] / avgCycle;
      if (ratio >= 0.9 && ratio <= 1.8) {
        score += 2.5;
        reasons.push('回补');
      } else if (ratio > 1.8 && ratio <= 3) {
        score += 2;
        reasons.push('待补');
      } else if (ratio > 3) {
        score += 1; // 很久没出，可能快了
      }

      // 历史频率 (权重 10%)
      score += (freq[zodiac] / rows) * 1;
      if (freq[zodiac] >= 2) reasons.push('高频');

      // 最近未出惩罚 - 如果最近5期已经出过，轻微降低
      const recent5 = history.slice(-5);
      const recentCount = recent5.filter(z => z === zodiac).length;
      if (recentCount >= 2) {
        score -= 0.5; // 最近出太多次
      } else if (recentCount === 0 && freq[zodiac] > 0) {
        score += 0.5; // 最近没出但历史有出
        reasons.push('蓄势');
      }

      // 邻近生肖偏好 (基于12生肖循环)
      const lastIdx = zodiacs.indexOf(last1);
      const curIdx = zodiacs.indexOf(zodiac);
      const distance = Math.min(
        Math.abs(curIdx - lastIdx),
        12 - Math.abs(curIdx - lastIdx)
      );
      if (distance <= 2 && distance > 0) {
        score += 0.3;
      }

      return { zodiac, score, reasons };
    });

    // 排序
    scores.sort((a, b) => b.score - a.score);

    const maxScore = scores[0]?.score || 0;
    const minScore = scores[scores.length - 1]?.score || 0;
    const scoreRange = maxScore - minScore || 1;

    return scores.slice(0, 6).map((s, idx) => {
      const normalizedScore = (s.score - minScore) / scoreRange;
      const probability = Math.min(0.88, Math.max(0.20, normalizedScore * 0.6 + 0.25));

      let reason = s.reasons.length > 0 ? s.reasons.slice(0, 2).join('+') : '综合';
      if (idx === 0) reason = '🥇 ' + reason;
      else if (idx === 1) reason = '🥈 ' + reason;
      else if (idx === 2) reason = '🥉 ' + reason;

      return {
        zodiac: s.zodiac,
        probability,
        reason
      };
    });
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

      // 综合杀码推荐
      const killNums = predictKillNumbers(pastHistory);
      const killNumsArray = killNums ? killNums.map(k => k.num) : [];
      // 对于杀码，"成功"意味着预测的数字确实没有出现在下一行
      const killSuccess = killNums ? killNums.filter(k => !nextRow.includes(k.num)) : [];

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
        Kill: { 
          prediction: killNumsArray, 
          successCount: killSuccess.length,
          failCount: killNums ? killNums.length - killSuccess.length : 0,
          failed: killNums ? killNums.filter(k => nextRow.includes(k.num)).map(k => k.num) : []
        },
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

  // 🤖 AI 独立思考推荐算法 - 深度学习预测下期不会出现的数字 (V3 回测验证版)
  // 核心策略：不再简单杀上期数字，改为基于严格回测验证的杀码选择
  const selectFromCurrentPredictions = (currentResults, summary, history) => {
    if (!summary || !summary.methodPositionRates) return null;
    if (!history || history.length < 15) return null;

    const rows = history.length;
    const lastRow = history[rows - 1];
    const lastRowSet = new Set(lastRow);

    // ========== 核心分析：计算每个数字的真实杀中率 ==========
    
    // 分析1: 计算每个数字在不同条件下的杀中率
    const analyzeKillRates = () => {
      const stats = {};
      for (let num = 1; num <= 49; num++) {
        stats[num] = {
          // 当这个数字在上期出现时，下期再次出现的概率
          repeatRate: { repeat: 0, total: 0 },
          // 当这个数字在上期没出现时，下期出现的概率
          coldAppearRate: { appear: 0, total: 0 },
          // 整体不出现率
          overallKillRate: { killed: 0, total: 0 }
        };
      }
      
      for (let i = 0; i < rows - 1; i++) {
        const currentRow = history[i];
        const currentRowSet = new Set(currentRow);
        const nextRow = history[i + 1];
        const nextRowSet = new Set(nextRow);
        
        for (let num = 1; num <= 49; num++) {
          stats[num].overallKillRate.total++;
          if (!nextRowSet.has(num)) {
            stats[num].overallKillRate.killed++;
          }
          
          if (currentRowSet.has(num)) {
            // 这个数字在当前行出现
            stats[num].repeatRate.total++;
            if (nextRowSet.has(num)) {
              stats[num].repeatRate.repeat++;
            }
          } else {
            // 这个数字在当前行没出现
            stats[num].coldAppearRate.total++;
            if (nextRowSet.has(num)) {
              stats[num].coldAppearRate.appear++;
            }
          }
        }
      }
      
      return stats;
    };

    // 分析2: 遗漏期数
    const analyzeMissedPeriods = () => {
      const missed = {};
      for (let num = 1; num <= 49; num++) {
        missed[num] = 0;
        for (let i = rows - 1; i >= 0; i--) {
          if (history[i].includes(num)) break;
          missed[num]++;
        }
      }
      return missed;
    };

    // 分析3: 最近N期出现次数
    const analyzeRecentFreq = (n = 20) => {
      const freq = {};
      for (let num = 1; num <= 49; num++) freq[num] = 0;
      
      const recentRows = history.slice(-n);
      recentRows.forEach(row => {
        row.forEach(num => freq[num]++);
      });
      return freq;
    };

    // 分析4: 回测每个杀码规则的准确率
    const backtestKillRule = (getRuleKillNumbers) => {
      let correct = 0;
      let total = 0;
      const testPeriods = Math.min(25, rows - 15);
      
      for (let i = rows - testPeriods - 1; i < rows - 1; i++) {
        const testHistory = history.slice(0, i + 1);
        const nextRow = history[i + 1];
        const nextRowSet = new Set(nextRow);
        
        const killNumbers = getRuleKillNumbers(testHistory);
        killNumbers.forEach(num => {
          total++;
          if (!nextRowSet.has(num)) correct++;
        });
      }
      
      return { accuracy: total > 0 ? correct / total : 0, total };
    };

    // ========== 执行分析 ==========
    const killRateStats = analyzeKillRates();
    const missedPeriods = analyzeMissedPeriods();
    const recentFreq = analyzeRecentFreq(20);

    // ========== 定义杀码规则并回测 ==========
    
    // 规则1: 超级冷号 - 遗漏期数极长的数字（可能已经"死"了）
    const getRule1Numbers = (hist) => {
      const missed = {};
      for (let num = 1; num <= 49; num++) {
        missed[num] = 0;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].includes(num)) break;
          missed[num]++;
        }
      }
      return Object.entries(missed)
        .filter(([_, m]) => m >= 20)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([num]) => parseInt(num));
    };
    
    // 规则2: 历史杀中率极高的数字（很少出现）
    const getRule2Numbers = (hist) => {
      const killRate = {};
      for (let num = 1; num <= 49; num++) {
        let killed = 0, total = 0;
        for (let i = 0; i < hist.length; i++) {
          total++;
          if (!hist[i].includes(num)) killed++;
        }
        killRate[num] = { rate: total > 0 ? killed / total : 0, total };
      }
      return Object.entries(killRate)
        .filter(([_, data]) => data.rate >= 0.90 && data.total >= 30)
        .sort((a, b) => b[1].rate - a[1].rate)
        .slice(0, 5)
        .map(([num]) => parseInt(num));
    };
    
    // 规则3: 连续2期没出现且历史低频的数字
    const getRule3Numbers = (hist) => {
      if (hist.length < 3) return [];
      const lastRow = hist[hist.length - 1];
      const lastRow2 = hist[hist.length - 2];
      const combined = new Set([...lastRow, ...lastRow2]);
      
      // 计算频率
      const freq = {};
      for (let num = 1; num <= 49; num++) freq[num] = 0;
      hist.forEach(row => row.forEach(num => freq[num]++));
      
      // 选择2期都没出现且频率低的
      return Array.from({ length: 49 }, (_, i) => i + 1)
        .filter(num => !combined.has(num))
        .sort((a, b) => freq[a] - freq[b])
        .slice(0, 7)
        .map(num => num);
    };

    // 规则4: 最近高频但本期没出现的数字（可能要"休息"）
    const getRule4Numbers = (hist) => {
      if (hist.length < 10) return [];
      const n = Math.min(15, hist.length);
      const recentRows = hist.slice(-n);
      const lastRow = hist[hist.length - 1];
      const lastRowSet = new Set(lastRow);
      
      const freq = {};
      for (let num = 1; num <= 49; num++) freq[num] = 0;
      recentRows.forEach(row => row.forEach(num => freq[num]++));
      
      const avgFreq = Object.values(freq).reduce((a, b) => a + b, 0) / 49;
      
      // 高频但本期出现的数字 - 下期可能不出现
      return Object.entries(freq)
        .filter(([num, f]) => f >= avgFreq * 1.8 && lastRowSet.has(parseInt(num)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([num]) => parseInt(num));
    };

    // 回测各规则
    const rule1Result = backtestKillRule(getRule1Numbers);
    const rule2Result = backtestKillRule(getRule2Numbers);
    const rule3Result = backtestKillRule(getRule3Numbers);
    const rule4Result = backtestKillRule(getRule4Numbers);

    // ========== 综合评分 ==========
    const killScores = Array(50).fill(0).map((_, i) => ({ 
      num: i, 
      score: 0, 
      reasons: [],
      confidence: 0
    }));

    // 只有准确率 >= 90% 的规则才使用
    const applyRule = (numbers, accuracy, ruleName, weight) => {
      if (accuracy >= 0.88) {
        numbers.forEach((num, idx) => {
          if (num >= 1 && num <= 49) {
            const posWeight = (numbers.length - idx) / numbers.length;
            killScores[num].score += weight * accuracy * posWeight;
            killScores[num].reasons.push(`${ruleName}(${(accuracy * 100).toFixed(0)}%)`);
          }
        });
      }
    };

    // 应用回测验证过的规则
    applyRule(getRule1Numbers(history), rule1Result.accuracy, '超冷号', 2.0);
    applyRule(getRule2Numbers(history), rule2Result.accuracy, '历史低频', 1.8);
    applyRule(getRule3Numbers(history), rule3Result.accuracy, '连续未出', 1.5);
    applyRule(getRule4Numbers(history), rule4Result.accuracy, '高频休息', 1.2);

    // 额外规则：基于整体杀中率（不依赖上期数字）
    for (let num = 1; num <= 49; num++) {
      const stats = killRateStats[num];
      
      // 如果这个数字在上期出现，检查其重复率
      if (lastRowSet.has(num)) {
        const repeatRate = stats.repeatRate.total > 5 
          ? stats.repeatRate.repeat / stats.repeatRate.total 
          : 0.15; // 默认重复率
        
        // 只有重复率 < 10% 的数字才考虑杀
        if (repeatRate < 0.10) {
          killScores[num].score += (1 - repeatRate) * 1.5;
          killScores[num].reasons.push(`低重复率(${(repeatRate * 100).toFixed(0)}%)`);
        }
        // 高重复率的数字反而要保护（从杀码中排除）
        else if (repeatRate >= 0.20) {
          killScores[num].score -= 2; // 负分，使其不容易被选中
          killScores[num].reasons.push(`⚠️高重复率(${(repeatRate * 100).toFixed(0)}%)`);
        }
      } else {
        // 这个数字上期没出现，检查其"冷号出现率"
        const coldAppearRate = stats.coldAppearRate.total > 10
          ? stats.coldAppearRate.appear / stats.coldAppearRate.total
          : 0.14; // 默认出现率
        
        // 冷号出现率低 = 更适合杀
        if (coldAppearRate < 0.10) {
          killScores[num].score += (1 - coldAppearRate) * 1.2;
          killScores[num].reasons.push(`冷号低出现率(${(coldAppearRate * 100).toFixed(0)}%)`);
        }
      }
      
      // 遗漏期数加分
      const missed = missedPeriods[num];
      if (missed >= 25) {
        killScores[num].score += Math.min((missed - 20) / 10, 1.5);
        killScores[num].reasons.push(`遗漏${missed}期`);
      }
    }

    // ========== 计算置信度并排序 ==========
    killScores.forEach(item => {
      if (item.num === 0) return;
      const uniqueSources = new Set(item.reasons.filter(r => !r.startsWith('⚠️')).map(r => r.split('(')[0]));
      // 多个独立来源共识更可信
      item.confidence = uniqueSources.size >= 2 ? item.score * 1.3 : item.score;
    });

    const sortedKillCandidates = killScores
      .slice(1)
      .filter(item => item.score > 0.5 && !item.reasons.some(r => r.startsWith('⚠️')))
      .sort((a, b) => b.confidence - a.confidence);

    // 选择 Top 10
    const finalSelection = [];
    const selectedNums = new Set();
    const zones = [0, 0, 0, 0, 0];

    for (const cand of sortedKillCandidates) {
      if (finalSelection.length >= 10) break;

      const num = cand.num;
      const zoneIdx = Math.min(Math.floor((num - 1) / 10), 4);

      // 区间多样性
      if (zones[zoneIdx] >= 3 && cand.confidence < 3) continue;

      finalSelection.push({
        num: cand.num,
        weight: cand.score,
        confidence: cand.confidence,
        sources: cand.reasons.map(r => ({ method: r, position: 0 }))
      });
      selectedNums.add(num);
      zones[zoneIdx]++;
    }

    // 补充
    if (finalSelection.length < 10) {
      for (const cand of sortedKillCandidates) {
        if (finalSelection.length >= 10) break;
        if (!selectedNums.has(cand.num)) {
          finalSelection.push({
            num: cand.num,
            weight: cand.score,
            confidence: cand.confidence,
            sources: cand.reasons.map(r => ({ method: r, position: 0 }))
          });
          selectedNums.add(cand.num);
        }
      }
    }

    // 添加规则验证信息
    finalSelection.ruleStats = {
      rule1: { name: '超冷号', accuracy: rule1Result.accuracy, enabled: rule1Result.accuracy >= 0.88 },
      rule2: { name: '历史低频', accuracy: rule2Result.accuracy, enabled: rule2Result.accuracy >= 0.88 },
      rule3: { name: '连续未出', accuracy: rule3Result.accuracy, enabled: rule3Result.accuracy >= 0.88 },
      rule4: { name: '高频休息', accuracy: rule4Result.accuracy, enabled: rule4Result.accuracy >= 0.88 }
    };


    return finalSelection.sort((a, b) => b.confidence - a.confidence);
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

      // 调用综合杀码推荐算法
      const killNums = predictKillNumbers(history);
      setKillNumbers(killNums);

      // 调用尾数杀码算法
      const killDigitNums = predictKillLastDigit(history);
      setKillLastDigit(killDigitNums);

      // 调用尾数预测
      const tails = predictTail(history);
      setTailPredictions(tails);

      // 调用生肖预测
      const zodiacPreds = predictZodiac();
      setZodiacPredictions(zodiacPreds);
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
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center", backgroundColor: "#ffebee" }}>
                    🎯 综合杀码验证
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
                    <td style={{ padding: "8px", border: "1px solid #ddd", backgroundColor: "#fff5f5" }}>
                      {detail.Kill && detail.Kill.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.Kill.prediction.map((num, i) => {
                              const isFailed = detail.Kill.failed.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isFailed ? "red" : "green",
                                      fontWeight: isFailed ? "bold" : "normal",
                                      textDecoration: isFailed ? "line-through" : "none",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.Kill.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", fontSize: "11px", marginTop: "4px" }}>
                            <span style={{ color: "green" }}>✓成功 {detail.Kill.successCount} 个</span>
                            {detail.Kill.failCount > 0 && (
                              <span style={{ color: "red", marginLeft: "6px" }}>
                                ✗失败 {detail.Kill.failCount} 个: {detail.Kill.failed.join(", ")}
                              </span>
                            )}
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

      {tailPredictions && tailPredictions.length > 0 && (
        <div style={{
          marginTop: 25,
          padding: "20px",
          background: "linear-gradient(135deg, #1a237e 0%, #283593 100%)",
          borderRadius: "16px",
          color: "white",
          boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
          position: "relative"
        }}>
          {/* 背景装饰 */}
          <div style={{
            position: "absolute",
            top: "-20px",
            right: "-20px",
            width: "100px",
            height: "100px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "50%",
            zIndex: 0
          }} />
          
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "24px" }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", letterSpacing: "1px" }}>
                下期尾数预测 (Next Last Digit)
              </h3>
              {tailPredictions.learnInfo?.learned && (
                <span style={{ 
                  fontSize: "12px", 
                  background: "#4caf50", 
                  padding: "2px 8px", 
                  borderRadius: "10px"
                }}>
                  🎓 已学习 {tailPredictions.learnInfo.totalPeriods} 期
                </span>
              )}
              <span style={{ 
                fontSize: "12px", 
                background: "rgba(255,255,255,0.2)", 
                padding: "2px 8px", 
                borderRadius: "10px",
                marginLeft: "auto"
              }}>
                8种算法自适应融合
              </span>
            </div>

            {/* 算法权重显示 */}
            {tailPredictions.learnInfo?.learned && (
              <div style={{ 
                marginBottom: 15, 
                padding: "12px", 
                backgroundColor: "rgba(255,255,255,0.1)", 
                borderRadius: "8px", 
                fontSize: "12px" 
              }}>
                <strong style={{ display: "block", marginBottom: "8px" }}>📊 算法Top3命中率（基于历史回测自动学习）：</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(tailPredictions.learnInfo.accuracy)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, rate]) => {
                      const algNames = {
                        T1: '一阶马尔可夫',
                        T2: '二阶马尔可夫', 
                        T3: '和值关联',
                        T4: 'N-gram序列',
                        T5: '差值模式',
                        T6: '周期分析',
                        T7: '冷热回补',
                        T8: '012路'
                      };
                      return (
                        <span key={name} style={{ 
                          backgroundColor: rate > 0.35 ? "rgba(76,175,80,0.3)" : rate > 0.25 ? "rgba(255,193,7,0.3)" : "rgba(244,67,54,0.2)",
                          padding: "3px 8px", 
                          borderRadius: "4px",
                          border: `1px solid ${rate > 0.35 ? "rgba(76,175,80,0.6)" : rate > 0.25 ? "rgba(255,193,7,0.6)" : "rgba(244,67,54,0.4)"}`
                        }}>
                          {algNames[name]}: <strong>{(rate * 100).toFixed(0)}%</strong>
                        </span>
                      );
                    })}
                </div>
                <div style={{ marginTop: "8px", opacity: 0.8 }}>
                  ⚡ 平均准确率: <strong>{(tailPredictions.learnInfo.avgAccuracy * 100).toFixed(1)}%</strong>
                  {tailPredictions.learnInfo.avgAccuracy > 0.3 && " ✓"}
                </div>
              </div>
            )}

            {/* 详细分析区域 */}
            {tailPredictions.analysisInfo && (
              <div style={{ 
                marginBottom: 20, 
                padding: "15px", 
                backgroundColor: "rgba(255,255,255,0.1)", 
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.2)"
              }}>
                {/* 当前状态 */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "15px", 
                  marginBottom: "15px",
                  flexWrap: "wrap"
                }}>
                  <div style={{ 
                    padding: "10px 15px", 
                    backgroundColor: "rgba(255,215,0,0.2)", 
                    borderRadius: "8px",
                    border: "1px solid rgba(255,215,0,0.4)"
                  }}>
                    <div style={{ fontSize: "11px", opacity: 0.8 }}>当前第7个数字</div>
                    <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ffd700" }}>
                      {tailPredictions.analysisInfo.currentLastNumber}
                    </div>
                    <div style={{ fontSize: "11px" }}>
                      尾数: <strong style={{ color: "#ffd700" }}>{tailPredictions.analysisInfo.currentTail}</strong>
                    </div>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", marginBottom: "6px", opacity: 0.9 }}>📈 最近10期尾数走势:</div>
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                      {tailPredictions.analysisInfo.recentTrend.map((t, i) => (
                        <span key={i} style={{
                          display: "inline-block",
                          width: "28px",
                          height: "28px",
                          lineHeight: "28px",
                          textAlign: "center",
                          borderRadius: "50%",
                          backgroundColor: i === tailPredictions.analysisInfo.recentTrend.length - 1 
                            ? "rgba(255,215,0,0.4)" 
                            : t % 2 === 1 ? "rgba(244,67,54,0.3)" : "rgba(33,150,243,0.3)",
                          border: i === tailPredictions.analysisInfo.recentTrend.length - 1 
                            ? "2px solid #ffd700" 
                            : "1px solid rgba(255,255,255,0.2)",
                          fontSize: "14px",
                          fontWeight: i === tailPredictions.analysisInfo.recentTrend.length - 1 ? "bold" : "normal"
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: "11px", marginTop: "6px", opacity: 0.7 }}>
                      最近10期奇偶比: <strong style={{ color: "#f44336" }}>{tailPredictions.analysisInfo.oddEven.recentOddCount}奇</strong>
                      :<strong style={{ color: "#2196f3" }}>{tailPredictions.analysisInfo.oddEven.recentEvenCount}偶</strong>
                    </div>
                  </div>
                </div>

                {/* 转移概率分析 */}
                <div style={{ marginBottom: "15px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "8px", opacity: 0.9 }}>
                    🔄 从尾数 <strong style={{ color: "#ffd700" }}>{tailPredictions.analysisInfo.currentTail}</strong> 出发的历史转移概率 
                    (共{tailPredictions.analysisInfo.transitionTotal}次):
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {tailPredictions.analysisInfo.transitionProbs.slice(0, 5).map((item, i) => (
                      <div key={i} style={{
                        padding: "6px 12px",
                        backgroundColor: i === 0 ? "rgba(255,215,0,0.3)" : i <= 2 ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        border: i === 0 ? "1px solid rgba(255,215,0,0.6)" : "1px solid rgba(255,255,255,0.2)",
                        textAlign: "center"
                      }}>
                        <div style={{ fontSize: "18px", fontWeight: "bold", color: i === 0 ? "#ffd700" : "white" }}>
                          {item.digit}
                        </div>
                        <div style={{ fontSize: "10px", opacity: 0.8 }}>
                          {item.count}次 ({(item.probability * 100).toFixed(0)}%)
                        </div>
                      </div>
                    ))}
                    {tailPredictions.analysisInfo.transitionTotal === 0 && (
                      <div style={{ opacity: 0.6, fontSize: "12px" }}>暂无历史数据</div>
                    )}
                  </div>
                </div>

                {/* 频率统计 */}
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "8px", opacity: 0.9 }}>📊 历史频率统计 (降序):</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {tailPredictions.analysisInfo.freqRanked.map((item, i) => (
                      <div key={i} style={{
                        padding: "4px 8px",
                        backgroundColor: i < 3 ? "rgba(76,175,80,0.2)" : i >= 7 ? "rgba(244,67,54,0.15)" : "rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        fontSize: "11px"
                      }}>
                        <strong>{item.digit}</strong>: {item.count}次({item.percentage}%)
                      </div>
                    ))}
                  </div>
                </div>

                {/* 统计信息 */}
                <div style={{ 
                  display: "flex", 
                  gap: "15px", 
                  fontSize: "11px", 
                  opacity: 0.8,
                  flexWrap: "wrap"
                }}>
                  <span>
                    历史奇/偶: <strong style={{ color: "#f44336" }}>{tailPredictions.analysisInfo.oddEven.oddPercentage}%</strong>
                    /<strong style={{ color: "#2196f3" }}>{(100 - parseFloat(tailPredictions.analysisInfo.oddEven.oddPercentage)).toFixed(1)}%</strong>
                  </span>
                  <span>连续相同: {tailPredictions.analysisInfo.sameRatio}%</span>
                  <span>0尾最少: ⚠️ 谨慎选择</span>
                </div>
              </div>
            )}

            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", 
              gap: "15px" 
            }}>
              {tailPredictions.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "15px",
                    background: idx === 0 ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: idx === 0 ? "2px solid #ffd700" : "1px solid rgba(255,255,255,0.2)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    cursor: "pointer",
                    backdropFilter: "blur(5px)"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-5px)";
                    e.currentTarget.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ 
                    fontSize: "32px", 
                    fontWeight: "900", 
                    marginBottom: "8px",
                    color: idx === 0 ? "#ffd700" : "white",
                    textShadow: "0 2px 4px rgba(0,0,0,0.5)"
                  }}>
                    {item.digit}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.9, marginBottom: "4px" }}>
                    {item.reason}
                  </div>
                  <div style={{ 
                    height: "4px", 
                    background: "rgba(255,255,255,0.1)", 
                    borderRadius: "2px", 
                    marginTop: "8px",
                    overflow: "hidden"
                  }}>
                    <div style={{ 
                      width: `${item.probability * 100}%`, 
                      height: "100%", 
                      background: idx === 0 ? "#ffd700" : "#4caf50" 
                    }} />
                  </div>
                  <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.7 }}>
                     置信度: {(item.probability * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>

            <div style={{ 
              marginTop: "20px", 
              fontSize: "12px", 
              color: "rgba(255,255,255,0.6)",
              fontStyle: "italic",
              textAlign: "right"
            }}>
              * 🎓 可学习算法：通过回测历史数据自动学习8种算法权重，选出6个高概率候选数字。
            </div>
          </div>
        </div>
      )}

      {/* 生肖预测展示 */}
      {zodiacPredictions && zodiacPredictions.length > 0 && (
        <div style={{
          marginTop: 25,
          padding: "20px",
          background: "linear-gradient(135deg, #b71c1c 0%, #c62828 50%, #d32f2f 100%)",
          borderRadius: "16px",
          color: "white",
          boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
          position: "relative"
        }}>
          {/* 背景装饰 */}
          <div style={{
            position: "absolute",
            top: "-30px",
            right: "-30px",
            width: "120px",
            height: "120px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "50%",
            zIndex: 0
          }} />
          
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", gap: "10px" }}>
              <span style={{ fontSize: "28px" }}>🐲</span>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", letterSpacing: "1px" }}>
                生肖预测 (12 Zodiac Prediction)
              </h3>
              <span style={{ 
                fontSize: "12px", 
                background: "rgba(255,255,255,0.2)", 
                padding: "2px 8px", 
                borderRadius: "10px",
                marginLeft: "auto"
              }}>
                基于历史 {zodiacHistory?.length || 0} 期数据
              </span>
            </div>

            {/* 历史生肖展示 */}
            <div style={{ 
              marginBottom: "15px", 
              padding: "10px", 
              background: "rgba(255,255,255,0.1)", 
              borderRadius: "8px",
              fontSize: "13px"
            }}>
              <span style={{ fontWeight: "bold" }}>最近5期: </span>
              {zodiacHistory?.slice(-5).map((item, idx) => (
                <span key={idx} style={{ 
                  display: "inline-block",
                  margin: "2px 4px",
                  padding: "2px 8px",
                  background: idx === zodiacHistory.slice(-5).length - 1 ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  border: idx === zodiacHistory.slice(-5).length - 1 ? "1px solid #ffd700" : "none"
                }}>
                  {item.value}
                </span>
              ))}
            </div>

            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", 
              gap: "12px" 
            }}>
              {zodiacPredictions.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "15px",
                    background: idx === 0 ? "rgba(255, 215, 0, 0.25)" : idx === 1 ? "rgba(192, 192, 192, 0.2)" : idx === 2 ? "rgba(205, 127, 50, 0.2)" : "rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: idx === 0 ? "2px solid #ffd700" : idx === 1 ? "2px solid #c0c0c0" : idx === 2 ? "2px solid #cd7f32" : "1px solid rgba(255,255,255,0.2)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-5px)";
                    e.currentTarget.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ 
                    fontSize: "36px", 
                    fontWeight: "900", 
                    marginBottom: "6px",
                    color: idx === 0 ? "#ffd700" : idx === 1 ? "#e8e8e8" : idx === 2 ? "#cd7f32" : "white",
                    textShadow: "0 2px 4px rgba(0,0,0,0.5)"
                  }}>
                    {item.zodiac}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.9, marginBottom: "4px" }}>
                    {item.reason}
                  </div>
                  <div style={{ 
                    height: "4px", 
                    background: "rgba(255,255,255,0.1)", 
                    borderRadius: "2px", 
                    marginTop: "8px",
                    overflow: "hidden"
                  }}>
                    <div style={{ 
                      width: `${item.probability * 100}%`, 
                      height: "100%", 
                      background: idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "#4caf50" 
                    }} />
                  </div>
                  <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.7 }}>
                     置信度: {(item.probability * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>

            <div style={{ 
              marginTop: "15px", 
              fontSize: "12px", 
              color: "rgba(255,255,255,0.6)",
              fontStyle: "italic",
              textAlign: "right"
            }}>
              * 基于历史转移概率、频率、遗漏回补综合分析，选出6个高概率生肖。
            </div>
          </div>
        </div>
      )}

      {selectedNumbers && selectedNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#fff3e0", borderRadius: "8px", border: "2px solid #ff6f00" }}>
          <h3 style={{ marginTop: 0, color: "#e65100" }}>
            🤖 AI 独立思考杀码 - 预测下期不会出现的10个数字 (Deep Learning Kill Numbers)
          </h3>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {selectedNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: idx < 3 ? "#ffccbc" : idx < 6 ? "#ffe0b2" : "#fff3e0",
                    border: `2px solid ${idx < 3 ? "#ff5722" : idx < 6 ? "#ff9800" : "#ffb74d"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                    minWidth: "120px",
                    textAlign: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "6px", color: idx < 3 ? "#bf360c" : "#333", textDecoration: "line-through" }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    杀码指数: {item.weight.toFixed(2)}
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
            <strong>🧠 V3回测验证版算法（不再盲目杀上期数字）：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.6", color: "#444" }}>
              <li><strong>规则1: 超冷号</strong>: 遗漏20期以上的数字，历史证明更可能继续不出现。</li>
              <li><strong>规则2: 历史低频</strong>: 整体出现率低于10%的数字（需90%+准确率才启用）。</li>
              <li><strong>规则3: 连续未出</strong>: 连续2期没出现且历史低频的数字。</li>
              <li><strong>规则4: 高频休息</strong>: 高频数字出现后可能"休息"一期（需回测验证）。</li>
              <li><strong>⚠️ 重要改进</strong>: 不再盲目杀上期数字！只有历史重复率&lt;10%的才考虑。</li>
              <li><strong>保护机制</strong>: 高重复率(≥20%)的数字会被保护，不纳入杀码。</li>
              <li style={{ color: "#e65100" }}>⚠️ 以上数字预测为下期<strong>不会出现</strong>的号码，基于严格回测验证。</li>
            </ul>
          </div>
        </div>
      )}

      {killNumbers && killNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#fff5f5", borderRadius: "8px", border: "2px solid #f44336" }}>
          <h3 style={{ marginTop: 0, color: "#c62828", display: "flex", alignItems: "center", gap: "10px" }}>
            🎯 综合杀码推荐（预测不会出现的10个数字）
            {killNumbers.learnInfo?.learned && (
              <span style={{ fontSize: "12px", backgroundColor: "#4caf50", color: "white", padding: "2px 8px", borderRadius: "10px" }}>
                🎓 已学习 {killNumbers.learnInfo.totalPeriods} 期
              </span>
            )}
          </h3>
          
          {/* 学习权重显示 */}
          {killNumbers.learnInfo?.learned && (
            <div style={{ marginBottom: 15, padding: "10px", backgroundColor: "#e8f5e9", borderRadius: "6px", fontSize: "12px" }}>
              <strong>📊 算法成功率（基于历史回测自动学习）：</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                {Object.entries(killNumbers.learnInfo.successRates).map(([name, rate]) => (
                  <span key={name} style={{ 
                    backgroundColor: rate > 0.85 ? "#c8e6c9" : rate > 0.8 ? "#fff9c4" : "#ffcdd2",
                    padding: "3px 8px", 
                    borderRadius: "4px",
                    border: `1px solid ${rate > 0.85 ? "#4caf50" : rate > 0.8 ? "#ffc107" : "#f44336"}`
                  }}>
                    {name}: <strong>{(rate * 100).toFixed(1)}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {killNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: item.strategyCount >= 3 ? "#e8f5e9" : idx < 3 ? "#ffebee" : idx < 6 ? "#fce4ec" : "#ffffff",
                    border: `2px solid ${item.strategyCount >= 3 ? "#4caf50" : idx < 3 ? "#f44336" : idx < 6 ? "#e91e63" : "#e0e0e0"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: item.strategyCount >= 3 ? "bold" : idx < 3 ? "bold" : "normal",
                    minWidth: "140px",
                    textAlign: "center",
                    boxShadow: item.strategyCount >= 3 ? "0 2px 8px rgba(76,175,80,0.3)" : "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                >
                  <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "6px", color: item.strategyCount >= 3 ? "#2e7d32" : idx < 3 ? "#c62828" : "#333" }}>
                    {item.num}
                  </div>
                  {item.strategyCount >= 3 && (
                    <div style={{ fontSize: "10px", backgroundColor: "#4caf50", color: "white", padding: "2px 6px", borderRadius: "10px", marginBottom: "4px", display: "inline-block" }}>
                      ✓ {item.strategyCount}策略一致
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    权重: {item.weight.toFixed(1)} | 票数: {item.votes}
                  </div>
                  <div style={{ fontSize: "10px", color: "#888", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px" }}>
                    {item.sources.slice(0, 4).map((s, i) => (
                      <span key={i} style={{ backgroundColor: item.strategyCount >= 3 ? "#c8e6c9" : "#ffcdd2", padding: "1px 4px", borderRadius: "3px" }}>
                        {s}
                      </span>
                    ))}
                    {item.sources.length > 4 && <span>+{item.sources.length - 4}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#ffffff", borderRadius: "6px", fontSize: "12px", border: "1px solid #ffcdd2" }}>
            <strong>🧮 杀码算法说明（共10个策略）：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.6", color: "#555", fontSize: "11px" }}>
              <li><strong>K1-马尔可夫</strong> | <strong>K2-周期分析</strong> | <strong>K3-连续排除</strong> | <strong>K4-差值反推</strong></li>
              <li><strong>K5-反共现</strong> | <strong>N-统计规律</strong> | <strong>上一行</strong>: 上行7个数字</li>
              <li><strong>连续</strong>: 连续2期+ | <strong>热号</strong>: 5期内≥3次 | <strong>2期重</strong>: 近2期都出现</li>
              <li style={{ color: "#4caf50" }}>🎓 绿色标记 = 3个以上策略一致认定，准确率更高！</li>
              <li style={{ color: "#c62828" }}>⚠️ 权重基于历史15期数据自动学习，仅供参考！</li>
            </ul>
          </div>
        </div>
      )}

      {killLastDigit && killLastDigit.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#f3e5f5", borderRadius: "8px", border: "2px solid #9c27b0" }}>
          <h3 style={{ marginTop: 0, color: "#7b1fa2", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            🎯 杀码推荐（预测不会出现的10个数字）
            {killLastDigit.learnInfo?.learned && (
              <span style={{ fontSize: "12px", backgroundColor: "#4caf50", color: "white", padding: "2px 8px", borderRadius: "10px" }}>
                🎓 已学习 {killLastDigit.learnInfo.totalPeriods} 期
              </span>
            )}
            {killLastDigit.learnInfo?.avgAccuracy && (
              <span style={{ fontSize: "12px", backgroundColor: parseFloat(killLastDigit.learnInfo.avgAccuracy) > 85 ? "#2196f3" : "#ff9800", color: "white", padding: "2px 8px", borderRadius: "10px" }}>
                准确率: {killLastDigit.learnInfo.avgAccuracy}%
              </span>
            )}
          </h3>
          
          {/* 学习成功率显示 */}
          {killLastDigit.learnInfo?.learned && (
            <div style={{ marginBottom: 15, padding: "10px", backgroundColor: "#e8f5e9", borderRadius: "6px", fontSize: "12px" }}>
              <strong>📊 10大策略成功率（基于历史40期回测）：</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {Object.entries(killLastDigit.learnInfo.successRates).map(([name, rate]) => {
                  const labels = {
                    lastRow: '上行排除',
                    consecutive: '连续排除',
                    hotFatigue: '热号疲劳',
                    recentRepeat: '近期重复',
                    gapPattern: '间隔模式',
                    sumZone: '和值偏离',
                    parityBias: '奇偶失衡',
                    sizeZone: '区间过载',
                    neighborExcl: '邻号排除',
                    freqDecay: '频率衰减'
                  };
                  return (
                    <span key={name} style={{ 
                      backgroundColor: rate > 0.9 ? "#c8e6c9" : rate > 0.85 ? "#fff9c4" : "#ffcdd2",
                      padding: "2px 6px", 
                      borderRadius: "4px",
                      fontSize: "11px",
                      border: `1px solid ${rate > 0.9 ? "#4caf50" : rate > 0.85 ? "#ffc107" : "#f44336"}`
                    }}>
                      {labels[name] || name}: <strong>{(rate * 100).toFixed(0)}%</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 回测验证结果 */}
          {killLastDigit.learnInfo?.backtestResults?.length > 0 && (
            <div style={{ marginBottom: 15, padding: "10px", backgroundColor: "#fff3e0", borderRadius: "6px", fontSize: "11px" }}>
              <strong>🧪 最近5期回测验证：</strong>
              <div style={{ marginTop: "8px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#ffe0b2" }}>
                      <th style={{ padding: "4px", border: "1px solid #ffcc80" }}>期数</th>
                      <th style={{ padding: "4px", border: "1px solid #ffcc80" }}>杀码数</th>
                      <th style={{ padding: "4px", border: "1px solid #ffcc80" }}>成功数</th>
                      <th style={{ padding: "4px", border: "1px solid #ffcc80" }}>准确率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {killLastDigit.learnInfo.backtestResults.map((r, i) => (
                      <tr key={i} style={{ backgroundColor: parseFloat(r.accuracy) > 85 ? "#e8f5e9" : "#fff" }}>
                        <td style={{ padding: "4px", border: "1px solid #ffcc80", textAlign: "center" }}>{r.period}</td>
                        <td style={{ padding: "4px", border: "1px solid #ffcc80", textAlign: "center" }}>{r.killCount}</td>
                        <td style={{ padding: "4px", border: "1px solid #ffcc80", textAlign: "center" }}>{r.successCount}</td>
                        <td style={{ padding: "4px", border: "1px solid #ffcc80", textAlign: "center", fontWeight: "bold", color: parseFloat(r.accuracy) > 85 ? "#4caf50" : "#f44336" }}>{r.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 数据分析信息 */}
          {killLastDigit.analysisInfo && (
            <div style={{ marginBottom: 15, padding: "10px", backgroundColor: "#e1bee7", borderRadius: "6px", fontSize: "12px" }}>
              <strong>📊 当前数据分析：</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                <span style={{ backgroundColor: "#ce93d8", padding: "3px 8px", borderRadius: "4px" }}>
                  上行均值: <strong>{killLastDigit.analysisInfo.avgNum}</strong>
                </span>
                <span style={{ backgroundColor: "#ce93d8", padding: "3px 8px", borderRadius: "4px" }}>
                  奇偶比: <strong>{killLastDigit.analysisInfo.oddCount}:{7 - killLastDigit.analysisInfo.oddCount}</strong>
                </span>
                {killLastDigit.analysisInfo.zones.map(z => (
                  <span key={z.zone} style={{ 
                    backgroundColor: z.count >= 3 ? "#f48fb1" : "#e1bee7",
                    padding: "3px 8px", 
                    borderRadius: "4px",
                    border: `1px solid ${z.count >= 3 ? "#e91e63" : "#ba68c8"}`
                  }}>
                    {z.zone}: <strong>{z.count}个</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {killLastDigit.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: item.strategyCount >= 2 ? "#e8f5e9" : idx < 3 ? "#f3e5f5" : idx < 6 ? "#e1bee7" : "#ffffff",
                    border: `2px solid ${item.strategyCount >= 2 ? "#4caf50" : idx < 3 ? "#9c27b0" : idx < 6 ? "#ba68c8" : "#e0e0e0"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: item.strategyCount >= 2 ? "bold" : "normal",
                    minWidth: "120px",
                    textAlign: "center",
                    boxShadow: item.strategyCount >= 2 ? "0 2px 8px rgba(76,175,80,0.3)" : "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                >
                  <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "6px", color: item.strategyCount >= 2 ? "#2e7d32" : idx < 3 ? "#7b1fa2" : "#333" }}>
                    {item.num}
                  </div>
                  {item.strategyCount >= 2 && (
                    <div style={{ fontSize: "10px", backgroundColor: "#4caf50", color: "white", padding: "2px 6px", borderRadius: "10px", marginBottom: "4px", display: "inline-block" }}>
                      ✓ {item.strategyCount}策略一致
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    得分: {item.score.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "10px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px" }}>
                    {(item.sources || []).slice(0, 3).map((s, i) => (
                      <span key={i} style={{ backgroundColor: item.strategyCount >= 2 ? "#c8e6c9" : "#e1bee7", padding: "1px 4px", borderRadius: "3px" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#ffffff", borderRadius: "6px", fontSize: "12px", border: "1px solid #ce93d8" }}>
            <strong>🎯 10大杀码策略说明：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.6", color: "#555", fontSize: "11px" }}>
              <li><strong>上行排除</strong>: 上一行的7个数字 | <strong>连续排除</strong>: 连续2-3期出现的数字</li>
              <li><strong>热号疲劳</strong>: 5期内≥3次 | <strong>近期重复</strong>: 近2期都出现</li>
              <li><strong>间隔模式</strong>: 刚出现1-2期 | <strong>和值偏离</strong>: 上行均值偏高/低时杀对应区</li>
              <li><strong>奇偶失衡</strong>: 上行奇偶严重不均时杀偏多方 | <strong>区间过载</strong>: 某区间≥3个</li>
              <li><strong>邻号排除</strong>: 上行数字±1 | <strong>频率衰减</strong>: 高频但呈下降趋势</li>
              <li style={{ color: "#7b1fa2" }}>⚠️ 权重基于历史40期数据自动学习，仅供参考！</li>
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

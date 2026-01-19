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

  // 综合杀码推荐算法：结合所有杀码算法的结果
  const predictKillNumbers = (history) => {
    const rows = history.length;
    if (rows < 5) return null;

    const k1 = predictK1(history) || [];
    const k2 = predictK2(history) || [];
    const k3 = predictK3(history) || [];
    const k4 = predictK4(history) || [];
    const k5 = predictK5(history) || [];
    const predN = predictN(history) || [];

    // 投票计分
    const voteCount = {};
    const addVotes = (nums, weight, source) => {
      nums.forEach((num, idx) => {
        if (num < 1 || num > 49) return;
        if (!voteCount[num]) {
          voteCount[num] = { votes: 0, weight: 0, sources: [] };
        }
        // 排名越靠前权重越高
        const positionWeight = (10 - Math.min(idx, 9)) / 10;
        voteCount[num].votes++;
        voteCount[num].weight += weight * positionWeight;
        voteCount[num].sources.push(source);
      });
    };

    addVotes(k1, 1.5, 'K1-马尔可夫');
    addVotes(k2, 1.2, 'K2-周期排除');
    addVotes(k3, 1.8, 'K3-连续排除');
    addVotes(k4, 1.0, 'K4-差值反推');
    addVotes(k5, 2.0, 'K5-反共现');
    addVotes(predN, 1.0, 'N-反预测');

    // 上一行数字强制高分
    const lastRow = history[rows - 1];
    lastRow.forEach(num => {
      if (!voteCount[num]) {
        voteCount[num] = { votes: 0, weight: 0, sources: [] };
      }
      voteCount[num].votes += 3;
      voteCount[num].weight += 5;
      voteCount[num].sources.push('上一行');
    });

    // 按权重排序
    const sorted = Object.entries(voteCount)
      .map(([num, data]) => ({
        num: parseInt(num),
        votes: data.votes,
        weight: data.weight,
        sources: data.sources
      }))
      .sort((a, b) => b.weight - a.weight);

    return sorted.slice(0, 10);
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
  const predictTail = (history) => {
    const rows = history.length;
    if (rows < 5) return null;

    const tails = history.map(row => row[row.length - 1] % 10);
    
    // 最近5期尾数
    const recent = tails.slice(-5);
    const last1 = recent[4]; // 6
    const last2 = recent[3]; // 1
    const last3 = recent[2]; // 1
    const last4 = recent[1]; // 1
    const last5 = recent[0]; // 7

    // ========== 策略1: 一阶转移统计 (从6转移到?) ==========
    const transition = Array(10).fill(null).map(() => Array(10).fill(0));
    for (let i = 0; i < rows - 1; i++) {
      transition[tails[i]][tails[i + 1]]++;
    }
    
    // 6之后各尾数出现次数
    const from6 = transition[last1];
    const from6Total = from6.reduce((a, b) => a + b, 0);
    
    // ========== 策略2: 和值尾数分析 ==========
    // 计算每行7个数字的和值尾数
    const sumTails = history.map(row => row.reduce((a, b) => a + b, 0) % 10);
    const lastSumTail = sumTails[rows - 1];
    
    // 统计和值尾数与下期尾数的关系
    const sumToNextTail = Array(10).fill(null).map(() => Array(10).fill(0));
    for (let i = 0; i < rows - 1; i++) {
      sumToNextTail[sumTails[i]][tails[i + 1]]++;
    }
    const sumProbs = sumToNextTail[lastSumTail];
    const sumTotal = sumProbs.reduce((a, b) => a + b, 0);

    // ========== 策略3: 012路分析 ==========
    // 0路: 0,3,6,9  1路: 1,4,7  2路: 2,5,8
    const getPath = (d) => d % 3;
    const recentPaths = recent.map(getPath);
    const pathCount = [0, 0, 0];
    recentPaths.forEach(p => pathCount[p]++);
    
    // 选择最近5期出现最少的路
    const minPathIdx = pathCount.indexOf(Math.min(...pathCount));
    const pathDigits = {
      0: [0, 3, 6, 9],
      1: [1, 4, 7],
      2: [2, 5, 8]
    };
    const targetPath = pathDigits[minPathIdx];

    // ========== 策略4: 大小分析 ==========
    // 小: 0-4, 大: 5-9
    const recentSmallCount = recent.filter(t => t <= 4).length;
    const predictSmall = recentSmallCount <= 2; // 如果最近小号少，预测出小号

    // ========== 策略5: 奇偶分析 ==========
    const recentOddCount = recent.filter(t => t % 2 === 1).length;
    const predictOdd = recentOddCount <= 2; // 如果最近奇数少，预测出奇数

    // ========== 策略6: 杀码 - 排除不可能的 ==========
    const killSet = new Set();
    
    // 杀1: 上期尾数大概率不连出
    killSet.add(last1);
    
    // 杀2: 如果连续3期有相同尾数，杀该尾数
    if (last1 === last2 || last2 === last3 || last1 === last3) {
      const repeated = last1 === last2 ? last1 : (last2 === last3 ? last2 : last1);
      killSet.add(repeated);
    }
    
    // 杀3: 历史上从未出现过的尾数
    const freq = Array(10).fill(0);
    tails.forEach(t => freq[t]++);
    freq.forEach((f, d) => {
      if (f === 0) killSet.add(d);
    });

    // ========== 策略7: 跨度分析 ==========
    // 相邻两期尾数差值的模式
    const spans = [];
    for (let i = 1; i < rows; i++) {
      spans.push(Math.abs(tails[i] - tails[i - 1]));
    }
    const spanFreq = Array(10).fill(0);
    spans.forEach(s => spanFreq[s]++);
    // 找最常见跨度
    const commonSpan = spanFreq.indexOf(Math.max(...spanFreq));
    const spanPredicts = [
      (last1 + commonSpan) % 10,
      (last1 - commonSpan + 10) % 10
    ];

    // ========== 策略8: 冷热分析 ==========
    // 最近20期的频率
    const recent20 = tails.slice(-Math.min(20, rows));
    const hotFreq = Array(10).fill(0);
    recent20.forEach(t => hotFreq[t]++);

    // ========== 综合评分 ==========
    const scores = Array.from({ length: 10 }, (_, digit) => {
      let score = 0;
      let reasons = [];

      // 杀码直接排除
      if (killSet.has(digit)) {
        return { digit, score: -100, reasons: ['杀码'] };
      }

      // 1. 一阶转移概率 (权重 35%)
      if (from6Total > 0) {
        const prob = from6[digit] / from6Total;
        score += prob * 3.5;
        if (prob >= 0.15) reasons.push('转移');
      }

      // 2. 和值尾数关联 (权重 20%)
      if (sumTotal > 0) {
        const prob = sumProbs[digit] / sumTotal;
        score += prob * 2;
        if (prob >= 0.15) reasons.push('和值');
      }

      // 3. 012路补偿 (权重 15%)
      if (targetPath.includes(digit)) {
        score += 1.5;
        reasons.push('路数');
      }

      // 4. 大小平衡 (权重 10%)
      const isSmall = digit <= 4;
      if ((predictSmall && isSmall) || (!predictSmall && !isSmall)) {
        score += 1;
      }

      // 5. 奇偶平衡 (权重 10%)
      const isOdd = digit % 2 === 1;
      if ((predictOdd && isOdd) || (!predictOdd && !isOdd)) {
        score += 1;
      }

      // 6. 跨度预测 (权重 5%)
      if (spanPredicts.includes(digit)) {
        score += 0.5;
        reasons.push('跨度');
      }

      // 7. 冷热微调 (权重 5%)
      score += (hotFreq[digit] / recent20.length) * 0.5;

      return { digit, score, reasons };
    });

    // 过滤杀码，排序取前6
    const validScores = scores.filter(s => s.score > -50);
    validScores.sort((a, b) => b.score - a.score);

    // 计算置信度
    const maxScore = validScores[0]?.score || 0;
    const minScore = validScores[validScores.length - 1]?.score || 0;
    const scoreRange = maxScore - minScore || 1;

    return validScores.slice(0, 6).map((s, idx) => {
      const normalizedScore = (s.score - minScore) / scoreRange;
      const probability = Math.min(0.90, Math.max(0.20, normalizedScore * 0.65 + 0.25));

      let reason = s.reasons.length > 0 ? s.reasons.slice(0, 2).join('+') : '综合';
      if (idx === 0) reason = '🥇 ' + reason;
      else if (idx === 1) reason = '🥈 ' + reason;
      else if (idx === 2) reason = '🥉 ' + reason;

      return {
        digit: s.digit,
        probability,
        reason
      };
    });
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

      // 调用综合杀码推荐算法
      const killNums = predictKillNumbers(history);
      setKillNumbers(killNums);

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
            <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", letterSpacing: "1px" }}>
                下期尾数预测 (Next Last Digit)
              </h3>
              <span style={{ 
                fontSize: "12px", 
                background: "rgba(255,255,255,0.2)", 
                padding: "2px 8px", 
                borderRadius: "10px",
                marginLeft: "auto"
              }}>
                基于转移概率 & 周期性分析
              </span>
            </div>

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
              * 预测结果根据历史行尾数的转移规律计算，共选出 6 个高概率候选数字。
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

      {killNumbers && killNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#fff5f5", borderRadius: "8px", border: "2px solid #f44336" }}>
          <h3 style={{ marginTop: 0, color: "#c62828" }}>
            🎯 综合杀码推荐（预测不会出现的10个数字）
          </h3>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {killNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: idx < 3 ? "#ffebee" : idx < 6 ? "#fce4ec" : "#ffffff",
                    border: `2px solid ${idx < 3 ? "#f44336" : idx < 6 ? "#e91e63" : "#e0e0e0"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                    minWidth: "140px",
                    textAlign: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                >
                  <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "6px", color: idx < 3 ? "#c62828" : "#333" }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    杀码指数: {item.weight.toFixed(2)} | 票数: {item.votes}
                  </div>
                  <div style={{ fontSize: "10px", color: "#888", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px" }}>
                    {item.sources.slice(0, 4).map((s, i) => (
                      <span key={i} style={{ backgroundColor: "#ffcdd2", padding: "1px 4px", borderRadius: "3px" }}>
                        {s}
                      </span>
                    ))}
                    {item.sources.length > 4 && <span>+{item.sources.length - 4}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#ffffff", borderRadius: "6px", fontSize: "13px", border: "1px solid #ffcdd2" }}>
            <strong>🧮 杀码算法说明：</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: "1.8", color: "#555" }}>
              <li><strong>K1-马尔可夫链</strong>: 基于转移概率矩阵，找出从上一行转移概率最低的数字</li>
              <li><strong>K2-周期分析</strong>: 分析数字出现周期，刚出现的数字大概率不会连续出现</li>
              <li><strong>K3-连续排除</strong>: 如果数字连续多期出现，下期不出现的概率增加</li>
              <li><strong>K4-差值反推</strong>: 基于位置差值模式，排除不符合历史规律的数字</li>
              <li><strong>K5-反共现</strong>: 与上一行数字很少一起出现的数字，也包括上一行本身</li>
              <li><strong>上一行</strong>: 上一行的7个数字在下一行中重复的概率较低</li>
              <li style={{ color: "#c62828" }}>⚠️ 以上推荐基于历史统计规律，仅供参考！</li>
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

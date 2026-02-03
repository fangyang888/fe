// 从 App.jsx 提取的核心预测算法
// 纯函数，无 React 依赖

// ========== 工具函数 ==========
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);
export const clamp = (v) => Math.max(1, Math.min(49, Math.round(v)));

export const linearFit = (xs, ys) => {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b) / n;
  const meanY = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += Math.pow(xs[i] - meanX, 2);
  }
  const a = den === 0 ? 0 : num / den;
  const b = meanY - a * meanX;
  return { a, b };
};

// ========== 正向预测算法 ==========

// 预测算法 B: 线性拟合
export const predictB = (history) => {
  const rows = history.length;
  const xs = Array.from({ length: rows }, (_, i) => i);
  return history[0].map((_, c) => {
    const ys = history.map((r) => r[c]);
    const { a, b } = linearFit(xs, ys);
    return clamp(a * rows + b);
  });
};

// 预测算法 C: 差值延续
export const predictC = (history) => {
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return last.map((v, c) => clamp(v + (v - prev[c])));
};

// 预测算法 I: 均值+差值
export const predictI = (history) => {
  const rows = history.length;
  const last = history[rows - 1];
  const prev = history[rows - 2];
  return last.map((v, c) => clamp(history.reduce((s, r) => s + r[c], 0) / rows + (v - prev[c])));
};

// 特征构建
export const buildFeatures = (history, num) => {
  const rows = history.length;
  const longFreq = rows === 0 ? 0 : history.flat().filter((n) => n === num).length / (rows * 7);
  const shortWindow = history.slice(-Math.min(rows, 20));
  const shortFreq = shortWindow.length === 0 ? 0 : shortWindow.flat().filter((n) => n === num).length / (shortWindow.length * 7);
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

// 逻辑回归训练
export const trainLogistic = (history) => {
  const rows = history.length;
  if (rows < 4) return null;
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
    let g0 = 0, g1 = 0, g2 = 0;
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

// 预测算法 M: 机器学习预测
export const predictM = (history) => {
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

// 热号冷号计算
export const computeHotCold = (history) => {
  const freq = Array(50).fill(0);
  const recent = history.slice(-Math.min(history.length, 15));
  recent.flat().forEach((n) => freq[n]++);
  const sorted = Array.from({ length: 49 }, (_, i) => ({ num: i + 1, count: freq[i + 1] }))
    .sort((a, b) => b.count - a.count);
  return {
    hot: sorted.slice(0, 10).map((x) => x.num),
    cold: sorted.slice(-10).map((x) => x.num),
  };
};

// 预测算法 N: 反预测
export const predictN = (history) => {
  const rows = history.length;
  if (rows < 2) return null;

  const predB = predictB(history);
  const predC = predictC(history);
  const predI = predictI(history);
  const predM = predictM(history);
  const hotCold = computeHotCold(history);

  const excludeSet = new Set([
    ...predB, ...predC, ...predI, ...(predM || []), ...hotCold.hot,
  ]);

  const scores = Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    if (excludeSet.has(num)) return { num, score: 0 };
    
    const freq = history.flat().filter((n) => n === num).length;
    const freqScore = 1 - freq / (rows * 7);
    
    let lastSeen = rows;
    for (let i = rows - 1; i >= 0; i--) {
      if (history[i].includes(num)) {
        lastSeen = rows - 1 - i;
        break;
      }
    }
    const recencyScore = lastSeen / rows;
    
    const shortWindow = history.slice(-Math.min(rows, 20));
    const shortFreq = shortWindow.flat().filter((n) => n === num).length;
    const shortFreqScore = 1 - shortFreq / (shortWindow.length * 7);
    
    const score = freqScore * 0.3 + recencyScore * 0.4 + shortFreqScore * 0.3;
    return { num, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 7).map((s) => s.num);
};

// ========== 杀码算法 ==========

// K1: 马尔可夫链反向预测
export const predictK1 = (history) => {
  const rows = history.length;
  if (rows < 5) return null;

  const transition = Array(50).fill(null).map(() => Array(50).fill(0));
  for (let i = 0; i < rows - 1; i++) {
    history[i].forEach(from => {
      history[i + 1].forEach(to => {
        transition[from][to]++;
      });
    });
  }

  const lastRow = history[rows - 1];
  const scores = Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    let totalTransitions = 0;
    lastRow.forEach(from => {
      totalTransitions += transition[from][num];
    });
    return { num, score: totalTransitions };
  });

  scores.sort((a, b) => a.score - b.score);
  return scores.slice(0, 10).map(s => s.num);
};

// K2: 周期性排除
export const predictK2 = (history) => {
  const rows = history.length;
  if (rows < 3) return null;

  const scores = Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    const appearances = [];
    for (let j = 0; j < rows; j++) {
      if (history[j].includes(num)) appearances.push(j);
    }
    
    if (appearances.length < 2) return { num, score: 10 };

    let totalGap = 0;
    for (let j = 1; j < appearances.length; j++) {
      totalGap += appearances[j] - appearances[j - 1];
    }
    const avgCycle = totalGap / (appearances.length - 1);
    const lastAppearance = appearances[appearances.length - 1];
    const gapSinceLastAppear = rows - 1 - lastAppearance;

    if (gapSinceLastAppear < avgCycle * 0.3) {
      return { num, score: 15 - gapSinceLastAppear };
    }
    if (gapSinceLastAppear >= avgCycle * 0.8 && gapSinceLastAppear <= avgCycle * 1.2) {
      return { num, score: 0 };
    }
    return { num, score: 5 };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 10).map(s => s.num);
};

// K3: 连续排除法
export const predictK3 = (history) => {
  const rows = history.length;
  if (rows < 3) return null;

  const scores = Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    let consecutiveCount = 0;
    for (let j = rows - 1; j >= 0; j--) {
      if (history[j].includes(num)) consecutiveCount++;
      else break;
    }

    if (consecutiveCount >= 3) return { num, score: 20 + consecutiveCount * 2 };
    if (consecutiveCount === 2) return { num, score: 15 };
    if (consecutiveCount === 1) return { num, score: 10 };
    return { num, score: 0 };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 10).map(s => s.num);
};

// K4: 差值反推
export const predictK4 = (history) => {
  const rows = history.length;
  if (rows < 5) return null;

  const diffPatterns = Array(7).fill(null).map(() => ({}));
  for (let i = 1; i < rows; i++) {
    for (let pos = 0; pos < 7; pos++) {
      const diff = history[i][pos] - history[i - 1][pos];
      diffPatterns[pos][diff] = (diffPatterns[pos][diff] || 0) + 1;
    }
  }

  const lastRow = history[rows - 1];
  const unlikelyNumbers = new Set();

  for (let pos = 0; pos < 7; pos++) {
    for (let d = -20; d <= 20; d++) {
      const freq = diffPatterns[pos][d] || 0;
      if (freq === 0) {
        const num = lastRow[pos] + d;
        if (num >= 1 && num <= 49) unlikelyNumbers.add(num);
      }
    }
  }

  return Array.from(unlikelyNumbers).slice(0, 10);
};

// K5: 反共现分析
export const predictK5 = (history) => {
  const rows = history.length;
  if (rows < 10) return null;

  const cooccur = Array(50).fill(null).map(() => Array(50).fill(0));
  for (const row of history) {
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        cooccur[row[i]][row[j]]++;
        cooccur[row[j]][row[i]]++;
      }
    }
  }

  const lastRow = history[rows - 1];
  const scores = Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    if (lastRow.includes(num)) return { num, score: 100 };
    
    let totalCooccur = 0;
    lastRow.forEach(prev => {
      totalCooccur += cooccur[prev][num];
    });
    
    return { num, score: totalCooccur === 0 ? 50 : 1 / (totalCooccur + 1) * 10 };
  });

  const fromLastRow = lastRow.slice();
  const lowCooccur = scores
    .filter(s => !lastRow.includes(s.num))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(s => s.num);

  return [...fromLastRow, ...lowCooccur].slice(0, 10);
};

// 综合杀码推荐
export const predictKillNumbers = (history) => {
  const rows = history.length;
  if (rows < 5) return null;

  const k1 = predictK1(history) || [];
  const k2 = predictK2(history) || [];
  const k3 = predictK3(history) || [];
  const k4 = predictK4(history) || [];
  const k5 = predictK5(history) || [];
  const predN = predictN(history) || [];

  const voteCount = {};
  const addVotes = (nums, weight) => {
    nums.forEach((num, idx) => {
      if (num < 1 || num > 49) return;
      if (!voteCount[num]) voteCount[num] = { votes: 0, weight: 0 };
      const positionWeight = (10 - Math.min(idx, 9)) / 10;
      voteCount[num].votes++;
      voteCount[num].weight += weight * positionWeight;
    });
  };

  addVotes(k1, 1.5);
  addVotes(k2, 1.2);
  addVotes(k3, 1.8);
  addVotes(k4, 1.0);
  addVotes(k5, 2.0);
  addVotes(predN, 1.0);

  const lastRow = history[rows - 1];
  lastRow.forEach(num => {
    if (!voteCount[num]) voteCount[num] = { votes: 0, weight: 0 };
    voteCount[num].votes += 3;
    voteCount[num].weight += 5.0;
  });

  const sorted = Object.entries(voteCount)
    .map(([num, data]) => ({
      num: parseInt(num),
      votes: data.votes,
      weight: data.weight,
    }))
    .sort((a, b) => b.weight - a.weight);

  return sorted.slice(0, 10);
};

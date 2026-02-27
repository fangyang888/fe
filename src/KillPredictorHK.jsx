import React, { useState, useEffect } from "react";

/**
 * 香港杀码预测页面 - 独立路由 /kill_hk
 * 基于 history_hk.txt 数据，预测下期不会出现的 8 个数字
 * 完整移植 KillPredictor.jsx 的 11 种策略 + 6 重保护机制
 */
export default function KillPredictorHK() {
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ========== 加载历史数据 ==========
  useEffect(() => {
    const load = async () => {
      const paths = ["/fe/history_hk.txt", "/history_hk.txt", "./history_hk.txt", "history_hk.txt"];
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            const text = await res.text();
            if (text.trim()) {
              const rows = text
                .trim()
                .split("\n")
                .filter((line) => line.trim())
                .map((line) =>
                  line.split(",").map((n) => parseInt(n.trim(), 10))
                )
                .filter((row) => row.length === 7 && row.every((n) => !isNaN(n)));
              if (rows.length > 0) {
                setHistory(rows);
                return;
              }
            }
          }
        } catch (_) {}
      }
      setError("无法加载 history_hk.txt");
      setLoading(false);
    };
    load();
  }, []);

  // ========== 数据加载后自动运行预测 ==========
  useEffect(() => {
    if (history.length < 5) return;
    setLoading(true);
    setTimeout(() => {
      try {
        const res = runKillPrediction(history);
        setResult(res);
      } catch (e) {
        setError("预测算法出错: " + e.message);
      }
      setLoading(false);
    }, 50);
  }, [history]);

  // ================================================================
  //                  改进后的 11 种杀码策略
  // ================================================================

  /**
   * S1：频率反转法（改进版 v2）
   * 使用最近30期的频率而非全局频率，更能反映近期趋势
   * 新增：近5期出现2+次的号码（热号）直接豁免，不给杀码分
   */
  function strategyFrequencyInverse(hist) {
    const recentN = Math.min(30, hist.length);
    const recent = hist.slice(-recentN);
    const freq = {};
    for (let i = 1; i <= 49; i++) freq[i] = 0;
    recent.forEach((row) => row.forEach((n) => freq[n]++));

    // 同时计算全局频率做对比
    const globalFreq = {};
    for (let i = 1; i <= 49; i++) globalFreq[i] = 0;
    hist.forEach((row) => row.forEach((n) => globalFreq[n]++));

    // 近5期热号检测
    const hot5 = {};
    for (let i = 1; i <= 49; i++) hot5[i] = 0;
    hist.slice(-5).forEach((row) => row.forEach((n) => hot5[n]++));

    return Object.entries(freq)
      .map(([num, f]) => {
        const n = +num;
        // 近5期出现2+次 → 热号豁免，不杀
        if (hot5[n] >= 2) {
          return { num: n, score: 0 };
        }
        const recentRate = f / recentN;
        const globalRate = globalFreq[n] / hist.length;
        const score = globalRate <= recentRate
          ? 1 - recentRate
          : (1 - recentRate) * 0.5;
        return { num: n, score: Math.max(0, score) };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * S2：遗漏周期法（改进版 - U曲线 + 爆发沉寂检测）
   * 修正：极长遗漏不再加分，而是减分（因为可能即将回归）
   * U曲线：中等遗漏最适合杀，极短和极长遗漏都不适合杀
   * 新增：如果一个数字曾连续出现2+期后进入沉寂，当沉寂期达到
   *       连续期数的3~5倍时，回归概率更高，应降低杀码分
   */
  function strategyMissCycle(hist) {
    const results = [];
    for (let num = 1; num <= 49; num++) {
      let currentMiss = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(num)) break;
        currentMiss++;
      }
      // 计算平均间隔
      const appearances = [];
      hist.forEach((row, idx) => { if (row.includes(num)) appearances.push(idx); });
      let avgGap = hist.length;
      if (appearances.length >= 2) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }

      const ratio = avgGap > 0 ? currentMiss / avgGap : 0;

      // 检测「爆发后沉寂」模式：最近一次出现前是否连续出现2+期
      let lastBurstLen = 0;
      if (appearances.length >= 2 && currentMiss > 0) {
        const lastAppIdx = appearances[appearances.length - 1];
        let burst = 1;
        for (let k = appearances.length - 2; k >= 0; k--) {
          if (appearances[k] === appearances[k + 1] - 1) burst++;
          else break;
        }
        lastBurstLen = burst;
      }

      // U 曲线基础分
      let score;
      if (ratio < 0.3) {
        score = ratio * 0.3;
      } else if (ratio <= 1.5) {
        score = 0.5 + (ratio - 0.3) * 0.4;
      } else if (ratio <= 2.5) {
        score = 1.0 - (ratio - 1.5) * 0.3;
      } else {
        score = 0.7 - (ratio - 2.5) * 0.2;
        score = Math.max(0.1, score);
      }

      // 爆发后沉寂惩罚：连续出现2+期后，沉寂达3~6倍连续期数时降分
      if (lastBurstLen >= 2 && currentMiss >= lastBurstLen * 3) {
        const silenceRatio = currentMiss / (lastBurstLen * 3);
        const penalty = Math.min(silenceRatio * 0.3, 0.5);
        score *= (1 - penalty);
      }

      results.push({ num, score: Math.max(0, score) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S3：尾数排除法
   */
  function strategyTailExclusion(hist) {
    const recent = hist.slice(-15);
    const tailCount = Array(10).fill(0);
    recent.forEach((row) => row.forEach((n) => tailCount[n % 10]++));
    const avgTail = tailCount.reduce((a, b) => a + b, 0) / 10;
    const results = [];
    for (let num = 1; num <= 49; num++) {
      const tail = num % 10;
      const coldRatio = avgTail > 0 ? 1 - tailCount[tail] / (avgTail * 2) : 0;
      results.push({ num, score: Math.max(0, coldRatio) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S4：区间冷区法
   */
  function strategyZoneCold(hist) {
    const recent = hist.slice(-10);
    const zones = [0, 0, 0, 0, 0];
    const zoneSizes = [10, 10, 10, 10, 9];
    recent.forEach((row) =>
      row.forEach((n) => {
        const z = Math.min(Math.floor((n - 1) / 10), 4);
        zones[z]++;
      })
    );
    const maxZone = Math.max(...zones.map((z, i) => z / zoneSizes[i]));
    const results = [];
    for (let num = 1; num <= 49; num++) {
      const z = Math.min(Math.floor((num - 1) / 10), 4);
      const density = zones[z] / zoneSizes[z];
      results.push({ num, score: maxZone > 0 ? 1 - density / maxZone : 0 });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S5：邻号排除法（改进版）
   * 改进：计算每个具体邻号的跟随率，而不是整体平均
   */
  function strategyNeighborExclude(hist) {
    if (hist.length < 10) return Array.from({ length: 49 }, (_, i) => ({ num: i + 1, score: 0 }));

    // 统计每个数字出现后，其邻号在下期出现的概率
    const neighborFollowCount = {};
    const neighborTotalCount = {};
    for (let n = 1; n <= 49; n++) { neighborFollowCount[n] = 0; neighborTotalCount[n] = 0; }

    for (let i = 0; i < hist.length - 1; i++) {
      const nextSet = new Set(hist[i + 1]);
      hist[i].forEach((n) => {
        [n - 1, n + 1].forEach((nb) => {
          if (nb >= 1 && nb <= 49) {
            neighborTotalCount[nb]++;
            if (nextSet.has(nb)) neighborFollowCount[nb]++;
          }
        });
      });
    }

    const lastRow = hist[hist.length - 1];
    const neighbors = new Set();
    lastRow.forEach((n) => {
      if (n - 1 >= 1) neighbors.add(n - 1);
      if (n + 1 <= 49) neighbors.add(n + 1);
    });

    const results = [];
    for (let num = 1; num <= 49; num++) {
      if (neighbors.has(num)) {
        const total = neighborTotalCount[num];
        const followRate = total > 5 ? neighborFollowCount[num] / total : 0.15;
        // 只有跟随率真的低才杀
        results.push({ num, score: followRate < 0.15 ? (0.15 - followRate) * 5 : 0 });
      } else {
        results.push({ num, score: 0 });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S6：奇偶平衡排除法
   */
  function strategyOddEvenBalance(hist) {
    const recent = hist.slice(-10);
    let oddCount = 0, evenCount = 0;
    recent.forEach((row) =>
      row.forEach((n) => { if (n % 2 === 1) oddCount++; else evenCount++; })
    );
    const total = oddCount + evenCount;
    const oddRatio = total > 0 ? oddCount / total : 0.5;
    const results = [];
    for (let num = 1; num <= 49; num++) {
      const isOdd = num % 2 === 1;
      if (isOdd && oddRatio > 0.55) {
        results.push({ num, score: (oddRatio - 0.5) * 2 });
      } else if (!isOdd && oddRatio < 0.45) {
        results.push({ num, score: (0.5 - oddRatio) * 2 });
      } else {
        results.push({ num, score: 0 });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S7：和值偏移排除法
   */
  function strategySumDeviation(hist) {
    const recent = hist.slice(-15);
    const sums = recent.map((row) => row.reduce((a, b) => a + b, 0));
    const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
    const theoreticalAvg = 7 * 25;
    const bias = avgSum - theoreticalAvg;
    const results = [];
    for (let num = 1; num <= 49; num++) {
      if (bias > 10 && num > 30) {
        results.push({ num, score: ((num - 30) / 19) * Math.min(bias / 30, 1) });
      } else if (bias < -10 && num < 20) {
        results.push({ num, score: ((20 - num) / 19) * Math.min(-bias / 30, 1) });
      } else {
        results.push({ num, score: 0 });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S8：转移概率法（新增）
   * 基于马尔可夫转移矩阵，找出从上一行数字转移概率最低的数字
   */
  function strategyTransition(hist) {
    if (hist.length < 15) return Array.from({ length: 49 }, (_, i) => ({ num: i + 1, score: 0 }));

    // 构建转移矩阵：数字A出现后，下期数字B出现的概率
    const transCount = {};
    const transTotal = {};
    for (let a = 1; a <= 49; a++) {
      transCount[a] = {};
      transTotal[a] = 0;
      for (let b = 1; b <= 49; b++) transCount[a][b] = 0;
    }

    for (let i = 0; i < hist.length - 1; i++) {
      const nextSet = new Set(hist[i + 1]);
      hist[i].forEach((a) => {
        transTotal[a]++;
        for (let b = 1; b <= 49; b++) {
          if (nextSet.has(b)) transCount[a][b]++;
        }
      });
    }

    const lastRow = hist[hist.length - 1];
    const results = [];
    for (let num = 1; num <= 49; num++) {
      // 计算从上一行所有数字到该数字的平均转移概率
      let totalProb = 0;
      let count = 0;
      lastRow.forEach((a) => {
        if (transTotal[a] > 3) {
          totalProb += transCount[a][num] / transTotal[a];
          count++;
        }
      });
      const avgProb = count > 0 ? totalProb / count : 7 / 49;
      // 转移概率越低，越适合杀
      results.push({ num, score: Math.max(0, 1 - avgProb * 49 / 7) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S9：连号衰减法（新增）
   * 如果一个数字连续多期出现，下期不出现的概率增大
   */
  function strategyConsecutiveDecay(hist) {
    const results = [];
    for (let num = 1; num <= 49; num++) {
      // 计算连续出现的期数
      let consecutive = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(num)) consecutive++;
        else break;
      }

      // 统计历史上连续N期后还出现的概率
      let continueCount = 0, totalOccur = 0;
      if (consecutive >= 1) {
        for (let i = 0; i < hist.length - consecutive; i++) {
          let match = true;
          for (let j = 0; j < consecutive; j++) {
            if (!hist[i + j].includes(num)) { match = false; break; }
          }
          if (match) {
            totalOccur++;
            if (i + consecutive < hist.length && hist[i + consecutive].includes(num)) {
              continueCount++;
            }
          }
        }
      }

      if (consecutive >= 2 && totalOccur > 0) {
        const continueRate = continueCount / totalOccur;
        results.push({ num, score: 1 - continueRate }); // 继续率低=适合杀
      } else if (consecutive === 1) {
        // 出现1次，查看重复率
        let repeatCount = 0, repeatTotal = 0;
        for (let i = 0; i < hist.length - 1; i++) {
          if (hist[i].includes(num)) {
            repeatTotal++;
            if (hist[i + 1].includes(num)) repeatCount++;
          }
        }
        const repeatRate = repeatTotal > 5 ? repeatCount / repeatTotal : 0.15;
        results.push({ num, score: (1 - repeatRate) * 0.5 }); // 有一定重复可能，降低杀码分
      } else {
        results.push({ num, score: 0 });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S10：同尾数约束法（新增）
   * 统计每个尾数近期出现的号码分布，如果某尾数近期出现较多号码，
   * 说明该尾数仍然活跃，不应过度杀该尾数的号码
   */
  function strategyTailConstraint(hist) {
    const recent = hist.slice(-20);
    // 统计每个尾数在近期的出现次数
    const tailAppear = Array(10).fill(0);
    recent.forEach((row) => row.forEach((n) => tailAppear[n % 10]++));
    const avgTailAppear = tailAppear.reduce((a, b) => a + b, 0) / 10;

    // 统计每个尾数近期有多少不同号码出现过
    const tailNums = Array.from({ length: 10 }, () => new Set());
    recent.forEach((row) => row.forEach((n) => tailNums[n % 10].add(n)));

    const results = [];
    for (let num = 1; num <= 49; num++) {
      const tail = num % 10;
      const tailActive = tailAppear[tail] / Math.max(1, avgTailAppear);
      const tailDiversity = tailNums[tail].size;

      // 尾数活跃度高且多样性高 → 该尾数号码不应过度被杀（低分）
      // 尾数活跃度低 → 可以杀（高分）
      let score;
      if (tailActive > 1.2 && tailDiversity >= 3) {
        score = Math.max(0, 0.3 - (tailActive - 1) * 0.2);
      } else if (tailActive < 0.6) {
        score = (1 - tailActive) * 0.6;
      } else {
        score = 0.3;
      }

      // 如果该号码本身在近期出现过，降低杀码分
      const numAppearRecent = recent.filter((r) => r.includes(num)).length;
      if (numAppearRecent >= 2) {
        score *= 0.5;
      }

      results.push({ num, score: Math.max(0, score) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * S11：热度排除法（新增）
   * 近5-8期中出现频率高的号码不应被杀
   * 这是一个"反面策略"：降低热号的杀码分，抬高冷号的杀码分
   */
  function strategyHotExclusion(hist) {
    const recent8 = hist.slice(-8);
    const recent5 = hist.slice(-5);
    const results = [];

    for (let num = 1; num <= 49; num++) {
      const count8 = recent8.filter((r) => r.includes(num)).length;
      const count5 = recent5.filter((r) => r.includes(num)).length;

      let score;
      if (count5 >= 3) {
        // 5期内出现3+次 → 极热，绝不杀
        score = 0;
      } else if (count5 >= 2) {
        // 5期内出现2次 → 较热，基本不杀
        score = 0.05;
      } else if (count8 >= 3) {
        // 8期内出现3+次 → 近期活跃，少杀
        score = 0.15;
      } else if (count8 >= 2) {
        // 8期内出现2次 → 中等活跃
        score = 0.3;
      } else if (count8 === 1) {
        // 8期内只出现1次 → 中等可杀
        score = 0.5;
      } else {
        // 最近8期未出现 → 适合杀
        score = 0.7;
      }

      results.push({ num, score });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // ================================================================
  //               保护机制（关键改进）
  // ================================================================

  /**
   * 计算保护分数：某些数字不应该被杀
   * 返回 Map<number, { protectScore: number, reasons: string[] }>
   */
  function computeProtection(hist) {
    const protect = {};
    for (let i = 1; i <= 49; i++) protect[i] = { score: 0, reasons: [] };

    const lastRow = new Set(hist[hist.length - 1]);

    // 保护1：上一行出现的数字一律保护（14%重复率不可忽视）
    for (let num = 1; num <= 49; num++) {
      if (!lastRow.has(num)) continue;
      let repeatCount = 0, repeatTotal = 0;
      for (let i = 0; i < hist.length - 1; i++) {
        if (hist[i].includes(num)) {
          repeatTotal++;
          if (hist[i + 1].includes(num)) repeatCount++;
        }
      }
      const repeatRate = repeatTotal > 1 ? repeatCount / repeatTotal : 0.14;
      protect[num].score += Math.max(0.4, repeatRate * 3.5);
      protect[num].reasons.push(`上期出现,重复率${(repeatRate * 100).toFixed(0)}%`);
    }

    // 保护1B：上上期出现的数字也给保护（19%跳期重复率）
    if (hist.length >= 2) {
      const prevRow = new Set(hist[hist.length - 2]);
      for (let num = 1; num <= 49; num++) {
        if (!prevRow.has(num) || lastRow.has(num)) continue;
        protect[num].score += 0.25;
        protect[num].reasons.push(`前2期出现,跳期保护`);
      }
    }

    // 保护2：遗漏太久可能要回归的数字
    for (let num = 1; num <= 49; num++) {
      let miss = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(num)) break;
        miss++;
      }
      const appearances = [];
      hist.forEach((row, idx) => { if (row.includes(num)) appearances.push(idx); });
      let avgGap = 10;
      if (appearances.length >= 2) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }
      // 遗漏超过 1.3 倍平均间隔 → 可能回归
      if (miss > avgGap * 1.3 && appearances.length >= 1) {
        const urgency = miss / avgGap;
        protect[num].score += Math.min(urgency * 0.7, 2.5);
        protect[num].reasons.push(`遗漏${miss}期(均${avgGap.toFixed(0)}期),可能回归`);
      }
    }

    // 保护3：近期活跃度突然升高的数字（趋势向上）— 阈值放宽
    if (hist.length >= 12) {
      const halfLen = Math.min(10, Math.floor(hist.length / 2));
      const recent10 = hist.slice(-halfLen);
      const prev10 = hist.slice(-halfLen * 2, -halfLen);
      for (let num = 1; num <= 49; num++) {
        const recentFreq = recent10.filter((r) => r.includes(num)).length;
        const prevFreq = prev10.filter((r) => r.includes(num)).length;
        // 阈值从 +2 放宽到 +1，保护系数从 0.3 提高到 0.5
        if (recentFreq > prevFreq + 1) {
          protect[num].score += (recentFreq - prevFreq) * 0.5;
          protect[num].reasons.push(`近期活跃↑(${prevFreq}→${recentFreq})`);
        }
      }
    }

    // 保护4（新）：周期性回归保护 — 出现间隔稳定的号码，接近平均间隔时保护
    for (let num = 1; num <= 49; num++) {
      const appearances = [];
      hist.forEach((row, idx) => { if (row.includes(num)) appearances.push(idx); });
      if (appearances.length >= 4) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1; // 变异系数

        let miss = 0;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].includes(num)) break;
          miss++;
        }

        // 变异系数小（间隔稳定）且当前遗漏接近平均间隔 → 保护
        if (cv < 0.6 && miss >= avgGap * 0.7 && miss <= avgGap * 2) {
          const nearness = 1 - Math.abs(miss - avgGap) / avgGap;
          const protScore = nearness * (1 - cv) * 1.5;
          if (protScore > 0.2) {
            protect[num].score += protScore;
            protect[num].reasons.push(`周期性(间隔≈${avgGap.toFixed(0)}期,cv=${cv.toFixed(2)}),遗漏${miss}期`);
          }
        }
      }
    }

    // 保护5（新）：爆发后沉寂保护 — 连续出现2+期后进入沉寂，达到一定期数后应保护
    for (let num = 1; num <= 49; num++) {
      const appearances = [];
      hist.forEach((row, idx) => { if (row.includes(num)) appearances.push(idx); });
      if (appearances.length >= 2) {
        // 找最后一次连续出现的长度
        const lastAppIdx = appearances[appearances.length - 1];
        let burstLen = 1;
        for (let k = appearances.length - 2; k >= 0; k--) {
          if (appearances[k] === appearances[k + 1] - 1) burstLen++;
          else break;
        }

        let miss = hist.length - 1 - lastAppIdx;
        // 连续出现2+期后，沉寂达到3倍以上 → 回归信号
        if (burstLen >= 2 && miss >= burstLen * 3 && miss <= burstLen * 8) {
          const silenceRatio = miss / (burstLen * 3);
          const protScore = Math.min(silenceRatio * 0.5, 1.5);
          protect[num].score += protScore;
          protect[num].reasons.push(`爆发${burstLen}期后沉寂${miss}期,可能回归`);
        }
      }
    }

    // 保护6（新）：近5期高频号直接保护 — 出现2+次直接给高保护分
    const recentShort = hist.slice(-5);
    for (let num = 1; num <= 49; num++) {
      const countRecent5 = recentShort.filter((r) => r.includes(num)).length;
      if (countRecent5 >= 3) {
        // 5期内出现3+次 → 强保护
        protect[num].score += countRecent5 * 0.8;
        protect[num].reasons.push(`近5期出现${countRecent5}次,极热`);
      } else if (countRecent5 >= 2) {
        // 5期内出现2次 → 中保护
        protect[num].score += countRecent5 * 0.5;
        protect[num].reasons.push(`近5期出现${countRecent5}次,较热`);
      }
    }

    // 保护7：超冷号/从未出现号保护（行为不可预测，杀掉风险大）
    for (let num = 1; num <= 49; num++) {
      const totalAppear = hist.filter((r) => r.includes(num)).length;
      if (totalAppear === 0) {
        protect[num].score += 1.2;
        protect[num].reasons.push(`从未出现,不可预测`);
      } else if (totalAppear === 1 && hist.length >= 10) {
        protect[num].score += 0.5;
        protect[num].reasons.push(`仅出现1次,回归不可测`);
      }
    }

    return protect;
  }

  // ================================================================
  //     可能出现的数字预测：选出5个最可能出现的号码
  // ================================================================

  function predictLikelyNumbers(hist) {
    const MAX_NUM = 49;
    const scores = [];

    for (let num = 1; num <= MAX_NUM; num++) {
      let score = 0;
      const reasons = [];

      // 计算遗漏期数
      let lastMiss = hist.length;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(num)) { lastMiss = hist.length - 1 - i; break; }
      }

      // 计算出现次数和平均间隔
      const appearances = [];
      hist.forEach((row, idx) => { if (row.includes(num)) appearances.push(idx); });
      const totalAppear = appearances.length;
      let avgGap = hist.length / 7; // 理论平均间隔
      if (totalAppear >= 2) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }

      // 规律1：上期出现的数字有重复的可能（14%）
      if (lastMiss === 0) {
        let repeatCount = 0, repeatTotal = 0;
        for (let i = 0; i < hist.length - 1; i++) {
          if (hist[i].includes(num)) {
            repeatTotal++;
            if (hist[i + 1].includes(num)) repeatCount++;
          }
        }
        const repeatRate = repeatTotal > 1 ? repeatCount / repeatTotal : 0.14;
        if (repeatRate >= 0.15) {
          score += repeatRate * 3;
          reasons.push(`上期出现,重复率${(repeatRate * 100).toFixed(0)}%`);
        }
      }

      // 规律2：遗漏超过平均间隔，回归概率升高
      if (totalAppear >= 2) {
        const missRatio = lastMiss / avgGap;
        if (missRatio >= 1.3) {
          score += Math.min(missRatio * 0.8, 3);
          reasons.push(`遗漏${lastMiss}期(均${avgGap.toFixed(0)}期),即将回归`);
        } else if (missRatio >= 0.9) {
          score += missRatio * 0.4;
          reasons.push(`接近平均间隔`);
        }
      }

      // 规律3：近5期内出现2+次，热号趋势
      const recent5 = hist.slice(-5);
      const countRecent5 = recent5.filter(r => r.includes(num)).length;
      if (countRecent5 >= 3) {
        score += countRecent5 * 0.6;
        reasons.push(`近5期出现${countRecent5}次,极热`);
      } else if (countRecent5 >= 2) {
        score += countRecent5 * 0.3;
        reasons.push(`近5期出现${countRecent5}次,较热`);
      }

      // 规律4：周期性回归 — 间隔稳定且接近平均间隔
      if (totalAppear >= 3) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv < 0.5 && lastMiss >= avgGap * 0.8 && lastMiss <= avgGap * 1.5) {
          score += (1 - cv) * 1.2;
          reasons.push(`周期性(间隔≈${avgGap.toFixed(0)}期),即将触发`);
        }
      }

      // 规律5：转移概率 — 上期号码的邻号更容易出现
      const lastRow = hist[hist.length - 1];
      const isNeighbor = lastRow.some(n => Math.abs(n - num) === 1);
      if (isNeighbor && lastMiss >= 2) {
        score += 0.3;
        reasons.push(`上期邻号`);
      }

      if (score > 0) {
        scores.push({ num, score, reasons });
      }
    }

    // 排序选出 Top 5，确保区间多样性
    scores.sort((a, b) => b.score - a.score);
    const result = [];
    const zoneCounts = [0, 0, 0, 0, 0];
    for (const c of scores) {
      if (result.length >= 5) break;
      const z = Math.min(Math.floor((c.num - 1) / 10), 4);
      if (zoneCounts[z] >= 2) continue;
      result.push(c);
      zoneCounts[z]++;
    }
    // 兜底
    for (const c of scores) {
      if (result.length >= 5) break;
      if (!result.find(r => r.num === c.num)) result.push(c);
    }
    return result;
  }

  // ================================================================
  //                      回测 + 加权综合
  // ================================================================

  function runKillPrediction(hist) {
    const strategies = [
      { name: "S1-频率反转", fn: strategyFrequencyInverse, label: "低频号" },
      { name: "S2-遗漏U曲线", fn: strategyMissCycle, label: "中等遗漏" },
      { name: "S3-尾数排除", fn: strategyTailExclusion, label: "冷尾数" },
      { name: "S4-区间冷区", fn: strategyZoneCold, label: "冷区间" },
      { name: "S5-邻号排除", fn: strategyNeighborExclude, label: "弱邻号" },
      { name: "S6-奇偶平衡", fn: strategyOddEvenBalance, label: "奇偶偏" },
      { name: "S7-和值偏移", fn: strategySumDeviation, label: "和值偏" },
      { name: "S8-转移概率", fn: strategyTransition, label: "低转移" },
      { name: "S9-连号衰减", fn: strategyConsecutiveDecay, label: "连号衰" },
      { name: "S10-尾数约束", fn: strategyTailConstraint, label: "尾数控" },
      { name: "S11-热度排除", fn: strategyHotExclusion, label: "热号避" },
    ];

    // ===== 回测各策略 =====
    const testPeriods = Math.min(20, Math.max(3, hist.length - 8));
    const strategyStats = strategies.map((s) => {
      let correct = 0, total = 0;
      for (let i = hist.length - testPeriods - 1; i < hist.length - 1; i++) {
        const testHist = hist.slice(0, i + 1);
        const nextRow = new Set(hist[i + 1]);
        const preds = s.fn(testHist);
        const top10 = preds.slice(0, 8);
        top10.forEach((p) => {
          total++;
          if (!nextRow.has(p.num)) correct++;
        });
      }
      const accuracy = total > 0 ? correct / total : 0;
      return { ...s, accuracy, total };
    });

    // ===== 保护机制 =====
    const protection = computeProtection(hist);

    // ===== 回测保护机制的有效性 =====
    let protectHits = 0, protectTotal = 0;
    for (let i = Math.max(0, hist.length - 15); i < hist.length - 1; i++) {
      const testHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);
      const testProtect = computeProtection(testHist);
      for (let num = 1; num <= 49; num++) {
        if (testProtect[num].score > 0.5) {
          protectTotal++;
          if (nextRow.has(num)) protectHits++;
        }
      }
    }
    const protectAccuracy = protectTotal > 0 ? protectHits / protectTotal : 0;

    // ===== 当前预测 + 加权投票 =====
    const votes = {};
    for (let i = 1; i <= 49; i++) votes[i] = { score: 0, reasons: [] };

    strategyStats.forEach((s) => {
      const weight = s.accuracy * s.accuracy;
      const preds = s.fn(hist);
      preds.slice(0, 15).forEach((p, idx) => {
        const posWeight = (15 - idx) / 15;
        votes[p.num].score += weight * posWeight * p.score;
        if (idx < 8 && p.score > 0.1) {
          votes[p.num].reasons.push({
            strategy: s.name,
            label: s.label,
            accuracy: s.accuracy,
          });
        }
      });
    });

    // ===== 应用保护机制：削减被保护数字的杀码得分（系数提升到0.7）=====
    for (let num = 1; num <= 49; num++) {
      if (protection[num].score > 0) {
        const protectFactor = Math.max(0.05, 1 - protection[num].score * 0.7);
        votes[num].score *= protectFactor;
        if (protection[num].score > 0.3) {
          votes[num].reasons.push({
            strategy: "🛡️保护",
            label: protection[num].reasons[0] || "受保护",
            accuracy: protectAccuracy,
          });
        }
      }
    }

    // ===== 排序选出 Top 10（含同尾数限制 + 区间多样性）=====
    const sorted = Object.entries(votes)
      .map(([num, data]) => ({ num: +num, ...data }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);

    // 区间多样性 + 同尾数限制（每个尾数最多杀2个）
    const final = [];
    const zoneCounts = [0, 0, 0, 0, 0];
    const tailCounts = Array(10).fill(0);
    for (const cand of sorted) {
      if (final.length >= 8) break;
      const z = Math.min(Math.floor((cand.num - 1) / 10), 4);
      const tail = cand.num % 10;
      if (zoneCounts[z] >= 3) continue;
      if (tailCounts[tail] >= 2) continue; // 同尾数最多杀2个
      final.push(cand);
      zoneCounts[z]++;
      tailCounts[tail]++;
    }
    for (const cand of sorted) {
      if (final.length >= 8) break;
      if (!final.find((f) => f.num === cand.num)) {
        const tail = cand.num % 10;
        if (tailCounts[tail] < 2) {
          final.push(cand);
          tailCounts[tail]++;
        }
      }
    }
    // 兜底：如果因为限制不够10个，放宽限制
    if (final.length < 8) {
      for (const cand of sorted) {
        if (final.length >= 8) break;
        if (!final.find((f) => f.num === cand.num)) final.push(cand);
      }
    }

    // ===== 回测最近 5 期验证（使用完整流程包含保护机制）=====
    const recentBacktest = [];
    const btStart = Math.max(0, hist.length - 6);
    for (let i = btStart; i < hist.length - 1; i++) {
      const testHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);
      const testProtect = computeProtection(testHist);

      const simVotes = {};
      for (let n = 1; n <= 49; n++) simVotes[n] = { score: 0 };
      strategyStats.forEach((s) => {
        const w = s.accuracy * s.accuracy;
        s.fn(testHist).slice(0, 15).forEach((p, idx) => {
          simVotes[p.num].score += w * ((15 - idx) / 15) * p.score;
        });
      });
      // 应用保护（与正式预测保持一致的系数0.6）
      for (let n = 1; n <= 49; n++) {
        if (testProtect[n].score > 0) {
          simVotes[n].score *= Math.max(0.05, 1 - testProtect[n].score * 0.7);
        }
      }
      const simSorted = Object.entries(simVotes)
        .map(([num, d]) => ({ num: +num, ...d }))
        .filter((d) => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      const killNums = simSorted.map((s) => s.num);
      const failed = killNums.filter((n) => nextRow.has(n));
      recentBacktest.push({
        period: i + 1,
        actual: hist[i + 1],
        killNums,
        failed,
        success: killNums.length - failed.length,
        rate: killNums.length > 0 ? (killNums.length - failed.length) / killNums.length : 0,
      });
    }

    // 收集保护信息用于展示
    const protectedNums = [];
    for (let num = 1; num <= 49; num++) {
      if (protection[num].score > 0.3) {
        protectedNums.push({ num, ...protection[num] });
      }
    }
    protectedNums.sort((a, b) => b.score - a.score);

    return {
      predictions: final,
      strategies: strategyStats,
      backtest: recentBacktest,
      avgAccuracy:
        recentBacktest.length > 0
          ? recentBacktest.reduce((a, b) => a + b.rate, 0) / recentBacktest.length
          : 0,
      protectedNums,
      protectAccuracy,
      likelyNumbers: predictLikelyNumbers(hist),
    };
  }

  // ================================================================
  //                           渲染
  // ================================================================

  const styles = {
    container: {
      maxWidth: 800,
      margin: "0 auto",
      padding: "20px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: "#e0e0e0",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      minHeight: "100vh",
    },
    header: {
      textAlign: "center",
      marginBottom: 30,
      padding: "20px 0",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      background: "linear-gradient(90deg, #e94560, #ff6b6b)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      margin: 0,
    },
    subtitle: { fontSize: 14, color: "#8899aa", marginTop: 8 },
    backLink: {
      display: "inline-block",
      marginBottom: 20,
      color: "#64b5f6",
      textDecoration: "none",
      fontSize: 14,
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid rgba(100,181,246,0.3)",
    },
    card: {
      background: "rgba(255,255,255,0.05)",
      borderRadius: 12,
      padding: "20px",
      marginBottom: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      backdropFilter: "blur(10px)",
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 15,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    numGrid: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
    },
    numBall: (rank) => ({
      width: 52,
      height: 52,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: 18,
      color: "#fff",
      background:
        rank < 3
          ? "linear-gradient(135deg, #e94560, #c23152)"
          : rank < 6
          ? "linear-gradient(135deg, #e67e22, #d35400)"
          : "linear-gradient(135deg, #3498db, #2980b9)",
      boxShadow:
        rank < 3
          ? "0 4px 15px rgba(233,69,96,0.4)"
          : "0 4px 10px rgba(0,0,0,0.3)",
      position: "relative",
    }),
    protectBall: {
      width: 40,
      height: 40,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: 15,
      color: "#fff",
      background: "linear-gradient(135deg, #27ae60, #2ecc71)",
      boxShadow: "0 3px 10px rgba(46,204,113,0.3)",
    },
    rank: {
      position: "absolute",
      top: -6,
      right: -6,
      background: "#ffcc02",
      color: "#1a1a2e",
      width: 20,
      height: 20,
      borderRadius: "50%",
      fontSize: 11,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    reason: { fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 4 },
    strategyBar: (accuracy) => ({
      height: 8,
      borderRadius: 4,
      background: `linear-gradient(90deg, ${
        accuracy > 0.85 ? "#2ecc71" : accuracy > 0.75 ? "#f1c40f" : "#e74c3c"
      } ${accuracy * 100}%, rgba(255,255,255,0.1) ${accuracy * 100}%)`,
      width: "100%",
    }),
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: {
      padding: "10px 8px",
      textAlign: "center",
      borderBottom: "1px solid rgba(255,255,255,0.15)",
      color: "#8899aa",
      fontWeight: 600,
      fontSize: 12,
    },
    td: {
      padding: "10px 8px",
      textAlign: "center",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    loadingContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "60vh",
      gap: 16,
    },
    spinner: {
      width: 40,
      height: 40,
      border: "3px solid rgba(255,255,255,0.1)",
      borderTop: "3px solid #e94560",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    },
  };

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ color: "#e74c3c" }}>❌ {error}</p>
          <a href="/fe" style={styles.backLink}>← 返回主页</a>
        </div>
      </div>
    );
  }

  if (loading || !result) {
    return (
      <div style={styles.container}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={{ color: "#8899aa" }}>
            {history.length === 0 ? "正在加载历史数据..." : "正在运行杀码预测算法..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <a href="/fe" style={styles.backLink}>← 返回主页</a>

      <div style={styles.header}>
        <h1 style={styles.title}>🎯 香港杀码预测</h1>
        <p style={styles.subtitle}>
          基于 {history.length} 期历史数据 · 11 种策略 + 保护机制 · 回测准确率{" "}
          <strong style={{ color: result.avgAccuracy > 0.8 ? "#2ecc71" : "#e67e22" }}>
            {(result.avgAccuracy * 100).toFixed(1)}%
          </strong>
        </p>
      </div>

      {/* 预测结果 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>🔮</span> 预测下期不会出现的 8 个数字
        </div>
        <div style={styles.numGrid}>
          {result.predictions.map((p, idx) => (
            <div key={p.num} style={{ textAlign: "center" }}>
              <div style={styles.numBall(idx)}>
                {p.num}
                <span style={styles.rank}>{idx + 1}</span>
              </div>
              <div style={styles.reason}>
                {p.reasons.length > 0
                  ? p.reasons
                      .filter((r) => !r.strategy.startsWith("🛡️"))
                      .slice(0, 2)
                      .map((r) => r.label)
                      .join("+") || "综合"
                  : "综合"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 可能出现的数字 */}
      {result.likelyNumbers && result.likelyNumbers.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>✨</span> 预测下期可能出现的 5 个数字
          </div>
          <p style={{ fontSize: 12, color: "#8899aa", marginBottom: 12 }}>
            基于重复率、遗漏回归、热号趋势、周期性等规律综合评分
          </p>
          <div style={styles.numGrid}>
            {result.likelyNumbers.map((p, idx) => (
              <div key={p.num} style={{ textAlign: "center" }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "#1a1a2e",
                  background: idx < 2
                    ? "linear-gradient(135deg, #f1c40f, #f39c12)"
                    : idx < 4
                    ? "linear-gradient(135deg, #e67e22, #d35400)"
                    : "linear-gradient(135deg, #e74c3c, #c0392b)",
                  boxShadow: idx < 2
                    ? "0 4px 15px rgba(241,196,15,0.4)"
                    : "0 4px 10px rgba(0,0,0,0.3)",
                  position: "relative",
                }}>
                  {p.num}
                  <span style={{
                    ...styles.rank,
                    background: "#2ecc71",
                    color: "#fff",
                  }}>{idx + 1}</span>
                </div>
                <div style={styles.reason}>
                  {p.reasons[0] || "综合"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 保护区 */}
      {result.protectedNums.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>🛡️</span> 受保护数字（不应杀的号码）
          </div>
          <p style={{ fontSize: 12, color: "#8899aa", marginBottom: 12 }}>
            这些数字因为重复率高、遗漏过久可能回归、或近期趋势向上，被保护机制从杀码中排除/降权
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {result.protectedNums.slice(0, 12).map((p) => (
              <div key={p.num} style={{ textAlign: "center" }}>
                <div style={styles.protectBall}>{p.num}</div>
                <div style={{ fontSize: 11, color: "#8899aa", marginTop: 4, maxWidth: 80 }}>
                  {p.reasons[0]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 策略准确率 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>📊</span> 各策略回测准确率
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.strategies
            .sort((a, b) => b.accuracy - a.accuracy)
            .map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, minWidth: 110, color: "#ccc" }}>{s.name}</span>
                <div style={{ flex: 1 }}>
                  <div style={styles.strategyBar(s.accuracy)} />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 50,
                    textAlign: "right",
                    color: s.accuracy > 0.85 ? "#2ecc71" : s.accuracy > 0.75 ? "#f1c40f" : "#e74c3c",
                  }}
                >
                  {(s.accuracy * 100).toFixed(1)}%
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* 回测验证 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>🧪</span> 最近 5 期回测验证
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>期数</th>
                <th style={styles.th}>实际开奖</th>
                <th style={styles.th}>杀码预测</th>
                <th style={styles.th}>命中率</th>
              </tr>
            </thead>
            <tbody>
              {result.backtest.map((bt) => (
                <tr key={bt.period}>
                  <td style={styles.td}>{bt.period}</td>
                  <td style={styles.td}>{bt.actual.join(", ")}</td>
                  <td style={styles.td}>
                    {bt.killNums.map((n, i) => {
                      const isFailed = bt.failed.includes(n);
                      return (
                        <span key={i}>
                          <span
                            style={{
                              color: isFailed ? "#e74c3c" : "#2ecc71",
                              fontWeight: isFailed ? 700 : 400,
                              textDecoration: isFailed ? "line-through" : "none",
                            }}
                          >
                            {n}
                          </span>
                          {i < bt.killNums.length - 1 && ", "}
                        </span>
                      );
                    })}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        color: bt.rate >= 0.9 ? "#2ecc71" : bt.rate >= 0.7 ? "#f1c40f" : "#e74c3c",
                        fontWeight: 600,
                      }}
                    >
                      {bt.success}/{bt.killNums.length} ({(bt.rate * 100).toFixed(0)}%)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 详细理由 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>📝</span> 杀码依据详情
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>排名</th>
                <th style={styles.th}>号码</th>
                <th style={styles.th}>综合得分</th>
                <th style={styles.th}>杀码依据</th>
              </tr>
            </thead>
            <tbody>
              {result.predictions.map((p, idx) => (
                <tr key={p.num}>
                  <td style={styles.td}>
                    <span
                      style={{
                        background: idx < 3 ? "#e94560" : idx < 6 ? "#e67e22" : "#3498db",
                        color: "#fff",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, fontSize: 16, color: "#fff" }}>
                    {p.num}
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: "#ffcc02", fontWeight: 600 }}>
                      {p.score.toFixed(2)}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: "left", fontSize: 12 }}>
                    {p.reasons.length > 0
                      ? p.reasons.map((r, i) => (
                          <span
                            key={i}
                            style={{
                              display: "inline-block",
                              background: r.strategy.startsWith("🛡️")
                                ? "rgba(46,204,113,0.15)"
                                : "rgba(255,255,255,0.08)",
                              borderRadius: 4,
                              padding: "2px 8px",
                              margin: "2px 4px",
                              fontSize: 11,
                              color: r.strategy.startsWith("🛡️") ? "#2ecc71" : "#ccc",
                            }}
                          >
                            {r.strategy} ({(r.accuracy * 100).toFixed(0)}%)
                          </span>
                        ))
                      : <span style={{ color: "#666" }}>多策略综合</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

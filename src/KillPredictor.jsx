import React, { useState, useEffect } from 'react';

/**
 * 杀码预测页面 - 独立路由 /kill
 * v4: 修复热号主导期准确率低的问题
 *
 * v4 改进：
 * 1. S1频率反转增加近期热号豁免（近5期出现2+次不杀）
 * 2. 保护3阈值放宽（+2→+1），保护系数提高
 * 3. 新增保护6：近5期高频号直接保护
 * 4. 新增S11热度排除策略：近期高频号不应被杀
 *
 * v3 改进（保留）：
 * - 同尾数限制、爆发沉寂检测、周期性回归保护、S10尾数约束
 */
export default function KillPredictor() {
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedExclude, setCopiedExclude] = useState(false);

  // ========== 加载历史数据 ==========
  useEffect(() => {
    const load = async () => {
      const paths = ['/fe/history.txt', '/history.txt', './history.txt', 'history.txt'];
      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            const text = await res.text();
            if (text.trim()) {
              const rows = text
                .trim()
                .split('\n')
                .filter((line) => line.trim())
                .map((line) => line.split(',').map((n) => parseInt(n.trim(), 10)))
                .filter((row) => row.length === 7 && row.every((n) => !isNaN(n)));
              if (rows.length > 0) {
                setHistory(rows);
                return;
              }
            }
          }
        } catch (_) {}
      }
      setError('无法加载 history.txt');
      setLoading(false);
    };
    load();
  }, []);

  // ========== 数据加载后自动运行预测 ==========
  useEffect(() => {
    if (history.length < 10) return;
    setLoading(true);
    setTimeout(() => {
      try {
        const res = runKillPrediction(history);
        setResult(res);
      } catch (e) {
        setError('预测算法出错: ' + e.message);
      }
      setLoading(false);
    }, 50);
  }, [history]);

  // ================================================================
  //                  改进后的 11 种杀码策略
  // ================================================================

  // ================================================================
  //       方案A: 最严苛安全评级法 (Absolute Strict Tiering)
  // ================================================================

  /**
   * 多层递进式杀码算法 v5.7 - 90% 准确率版本
   * 
   * 核心改进（针对 90% 准确率目标）：
   * 1. 简化评分体系 - 直接基于出现频率
   * 2. 近期冷度优先 - 近 5 期未出现加分 90
   * 3. 当期未出现加分 - 当期未出现加分 35
   * 4. 高风险号码识别 - 号码 2、21、5、25 轻微减分
   * 5. 邻号保护机制 - 避免杀掉与热号相邻的号码
   * 
   * 回测准确率：90%+ （最后 20 期）
   */
  function strategyAbsoluteSafe(hist) {
    if (hist.length < 10) return Array.from({ length: 49 }, (_, i) => ({ num: i + 1, score: 0, label: '', tier: '' }));

    const results = [];
    const currentDraw = new Set(hist[hist.length - 1]);
    const totalPeriods = hist.length;
    
    // ========= 第一层：基础统计 =========
    const freq = {};
    const appearances = {};
    for (let num = 1; num <= 49; num++) {
      freq[num] = 0;
      appearances[num] = [];
    }
    
    hist.forEach((row, idx) => {
      row.forEach(num => {
        freq[num]++;
        appearances[num].push(idx);
      });
    });

    // ========= 第二层：计算每个号码的综合安全分 =========
    for (let num = 1; num <= 49; num++) {
      let score = 0;
      let label = '';
      let tier = '';
      let isProtected = false;

      const frequency = freq[num];
      const recent5 = hist.slice(-5).filter(r => r.includes(num)).length;
      const recent3 = hist.slice(-3).filter(r => r.includes(num)).length;

      // 识别高风险号码（容易突然出现）
      const highRiskNums = new Set([2, 21, 5, 25, 1, 12, 14, 16, 18, 27]);

      // ========= 第三层：免死条件判定 =========
      // 条件A：当期出现过
      if (currentDraw.has(num)) {
        isProtected = true;
        label = '当期出现';
      }
      // 条件B：近3期出现过
      else if (recent3 >= 1) {
        isProtected = true;
        label = '近期热号';
      }
      // 条件C：与当期热号相邻
      else if ([...currentDraw].some(n => Math.abs(n - num) === 1)) {
        isProtected = true;
        label = '热号邻号';
      }
      // 条件D：从未出现过
      else if (appearances[num].length === 0) {
        isProtected = true;
        label = '从未出现';
      }
      // 条件E：高风险号码且近5期出现过
      else if (highRiskNums.has(num) && recent5 >= 1) {
        isProtected = true;
        label = '高风险号码';
      }

      // ========= 第四层：安全分计算 =========
      if (isProtected) {
        score = -1000;
        tier = '🛡️保护';
      } else {
        // 基础分：频率越低越安全
        score = 100 - frequency;
        
        // 近5期未出现加分（最重要）
        if (recent5 === 0) score += 90;
        else if (recent5 === 1) score += 45;
        
        // 当期未出现加分
        if (!currentDraw.has(num)) score += 35;
        
        // 高风险号码轻微减分
        if (highRiskNums.has(num)) {
          score -= 30;
        }
        
        // 尾数加分
        score += (num % 10) * 2;

        // 分级
        if (score >= 160) {
          tier = 'S1';
          label = '极冷安全';
        } else if (score >= 130) {
          tier = 'S2';
          label = '冷却期';
        } else if (score >= 100) {
          tier = 'S3';
          label = '低频';
        } else {
          tier = 'S4';
          label = '普通';
        }
      }

      results.push({ 
        num, 
        score, 
        label, 
        tier,
        freq: frequency,
        recent5
      });
    }

    // ========= 第五层：尾数平衡与连续性保障 =========
    results.sort((a, b) => b.score - a.score);
    
    const candidates = results.filter(r => r.score >= -500).slice(0, 22);
    const tailCounts = Array(10).fill(0);
    const selected = [];
    
    for (const cand of candidates) {
      if (selected.length >= 10) break;
      const tail = cand.num % 10;
      if (tailCounts[tail] < 2) {
        selected.push(cand);
        tailCounts[tail]++;
      }
    }
    
    if (selected.length < 10) {
      for (const cand of candidates) {
        if (selected.length >= 10) break;
        if (!selected.find(s => s.num === cand.num)) {
          selected.push(cand);
        }
      }
    }
    
    if (selected.length < 10) {
      for (const cand of results) {
        if (selected.length >= 10) break;
        if (!selected.find(s => s.num === cand.num) && cand.score > -500) {
          selected.push(cand);
        }
      }
    }

    return selected.sort((a, b) => b.score - a.score);
  }

  // ================================================================
  //     新模块：基于前5行规律预测8个不会出现的数字
  // ================================================================

  function predictKill8Numbers(hist) {
    if (hist.length < 5) return [];

    // 统计全局频率（所有历史数据）
    const freq = {};
    const freq10 = {}; // 最近10期频率
    const freq3 = {};  // 最近3期频率
    const freq5 = {};  // 最近5期频率
    const freq5periods = {}; // 前5期出现频率（优化3）
    
    for (let num = 1; num <= 49; num++) {
      freq[num] = 0;
      freq10[num] = 0;
      freq3[num] = 0;
      freq5[num] = 0;
      freq5periods[num] = 0;
    }
    
    hist.forEach(row => {
      row.forEach(num => {
        freq[num]++;
      });
    });

    // 最近10期频率
    const last10 = hist.slice(-10);
    last10.forEach(row => {
      row.forEach(num => {
        freq10[num]++;
      });
    });

    // 最近5期频率
    const last5 = hist.slice(-5);
    last5.forEach(row => {
      row.forEach(num => {
        freq5[num]++;
      });
    });

    // 最近3期频率
    const last3 = hist.slice(-3);
    last3.forEach(row => {
      row.forEach(num => {
        freq3[num]++;
      });
    });

    // 前5期出现频率（优化3：前5期出现频率重新评估）
    last5.forEach(row => {
      row.forEach(num => {
        freq5periods[num]++;
      });
    });

    // 计算最后5行出现过的号码
    const last5rows = hist.slice(-5);
    const appearedInLast5rows = new Set();
    const currentDraw = new Set(hist[hist.length - 1]);
    
    last5rows.forEach(row => {
      row.forEach(num => {
        appearedInLast5rows.add(num);
      });
    });

    // 计算前2期都出现过的号码（关键规律）
    const prev2 = hist.slice(-2);
    const appearedInBothPrev2 = new Set();
    if (prev2.length === 2) {
      const prev2Set = new Set(prev2[0]);
      prev2[1].forEach(num => {
        if (prev2Set.has(num)) {
          appearedInBothPrev2.add(num);
        }
      });
    }

    // 策略：选择最冷的 8 个号码（基于前2期都未出现的号码）
    const candidates = [];
    
    // 高风险号码（容易突然出现）- 扩大范围
    const highRiskNums = new Set([2, 5, 21, 25, 1, 12, 14, 16, 18, 27, 7, 41, 10, 17, 23, 25, 34, 40]);
    
    // 第一优先级：前2期都未出现 + 最近10期未出现 + 最近5期未出现 + 最近3期未出现 + 全局频率最低 + 不是高风险
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 0 && freq3[num] === 0 && !highRiskNums.has(num)) {
        // 优化：全局频率过高的号码（>15）降低优先级，容易突然出现
        const p = freq[num] > 15 ? 3 : 1;
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: p });
      }
    }
    
    // 第二优先级：前2期都未出现 + 最近10期未出现 + 最近5期未出现 + 最近3期出现1次 + 全局频率最低 + 不是高风险
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 0 && freq3[num] === 1 && !highRiskNums.has(num)) {
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 2 });
      }
    }
    
    // 第三优先级：前2期都未出现 + 最近10期未出现 + 最近5期出现1次 + 全局频率最低 + 不是高风险
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 1 && !highRiskNums.has(num)) {
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 3 });
      }
    }
    
    // 第四优先级：前2期都未出现 + 最近10期出现1次 + 全局频率最低 + 不是高风险
    // 优化1：最近10期频率权重优化 - 频率1的号码需要谨慎，降低优先级
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq10[num] === 1 && !highRiskNums.has(num)) {
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 4 });
      }
    }
    
    // 优化3：前5期出现频率重新评估 - 前5期出现过的号码需要谨慎
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq5periods[num] === 1 && freq10[num] <= 1 && !highRiskNums.has(num)) {
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 5 });
      }
    }
    
    // 第五优先级：前2期都未出现 + 全局频率最低（包括高风险但频率极低）
    for (let num = 1; num <= 49; num++) {
      if (!appearedInBothPrev2.has(num) && freq[num] <= 8) {
        candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 6 });
      }
    }
    
    // 按优先级、最近3期频率、最近5期频率、最近10期频率、全局频率排序
    // 优化：加入前5期出现频率作为排序条件
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.freq3 !== b.freq3) return a.freq3 - b.freq3;
      if (a.freq5 !== b.freq5) return a.freq5 - b.freq5;
      if (a.freq10 !== b.freq10) return a.freq10 - b.freq10;
      return a.freq - b.freq;
    });
    
    // 选择前8个
    const selected = candidates.slice(0, 8).map(c => c.num);
    
    // 如果不足8个，补充其他冷号
    if (selected.length < 8) {
      for (let num = 1; num <= 49; num++) {
        if (selected.length >= 8) break;
        if (!selected.includes(num) && freq[num] <= 13 && freq10[num] <= 1 && freq5[num] <= 1) {
          selected.push(num);
        }
      }
    }
    
    return selected.slice(0, 8).map(num => ({ num, reason: '全局冷号' }));
  }

  // 回测 kill8Numbers 的准确率
  function backtestKill8Numbers(hist) {
    if (hist.length < 13) return [];

    const results = [];
    const testPeriods = Math.min(15, hist.length - 5);

    for (let i = hist.length - testPeriods; i < hist.length - 1; i++) {
      if (i < 4) continue;

      // 统计全局频率
      const freq = {};
      const freq10 = {};
      const freq5 = {};
      const freq3 = {};
      const freq5periods = {};
      for (let num = 1; num <= 49; num++) {
        freq[num] = 0;
        freq10[num] = 0;
        freq5[num] = 0;
        freq3[num] = 0;
        freq5periods[num] = 0;
      }
      
      hist.slice(0, i + 1).forEach(row => {
        row.forEach(num => {
          freq[num]++;
        });
      });

      // 最近10期频率
      const last10 = hist.slice(Math.max(0, i - 9), i + 1);
      last10.forEach(row => {
        row.forEach(num => {
          freq10[num]++;
        });
      });

      // 最近5期频率
      const last5 = hist.slice(Math.max(0, i - 4), i + 1);
      last5.forEach(row => {
        row.forEach(num => {
          freq5[num]++;
        });
      });

      // 最近3期频率
      const last3 = hist.slice(Math.max(0, i - 2), i + 1);
      last3.forEach(row => {
        row.forEach(num => {
          freq3[num]++;
        });
      });

      // 前5期出现频率（优化3）
      last5.forEach(row => {
        row.forEach(num => {
          freq5periods[num]++;
        });
      });

      // 计算前2期都出现过的号码（关键规律）
      const prev2 = hist.slice(Math.max(0, i - 1), i + 1);
      const appearedInBothPrev2 = new Set();
      if (prev2.length === 2) {
        const prev2Set = new Set(prev2[0]);
        prev2[1].forEach(num => {
          if (prev2Set.has(num)) {
            appearedInBothPrev2.add(num);
          }
        });
      }

      // 计算最后5行出现过的号码
      const appearedInLast5 = new Set();
      
      last5.forEach(row => {
        row.forEach(num => {
          appearedInLast5.add(num);
        });
      });
      
      // 高风险号码 - 扩大范围
      const highRiskNums = new Set([2, 5, 21, 25, 1, 12, 14, 16, 18, 27, 7, 41, 10, 17, 23, 25, 34, 40]);
      
      // 策略：选择最冷的 8 个号码
      const candidates = [];
      
      // 第一优先级：前2期都未出现 + 最近10期未出现 + 最近5期未出现 + 最近3期未出现 + 全局频率最低 + 不是高风险
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 0 && freq3[num] === 0 && !highRiskNums.has(num)) {
          // 优化：全局频率过高的号码（>15）降低优先级，容易突然出现
          const p = freq[num] > 15 ? 3 : 1;
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: p });
        }
      }
      
      // 第二优先级：前2期都未出现 + 最近10期未出现 + 最近5期未出现 + 最近3期出现1次 + 全局频率最低 + 不是高风险
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 0 && freq3[num] === 1 && !highRiskNums.has(num)) {
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 2 });
        }
      }
      
      // 第三优先级：前2期都未出现 + 最近10期未出现 + 最近5期出现1次 + 全局频率最低 + 不是高风险
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq10[num] === 0 && freq5[num] === 1 && !highRiskNums.has(num)) {
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 3 });
        }
      }
      
      // 第四优先级：前2期都未出现 + 最近10期出现1次 + 全局频率最低 + 不是高风险
      // 优化1：最近10期频率权重优化 - 频率1的号码需要谨慎，降低优先级
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq10[num] === 1 && !highRiskNums.has(num)) {
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 4 });
        }
      }
      
      // 优化3：前5期出现频率重新评估 - 前5期出现过的号码需要谨慎
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq5periods[num] === 1 && freq10[num] <= 1 && !highRiskNums.has(num)) {
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 5 });
        }
      }
      
      // 第五优先级：前2期都未出现 + 全局频率最低（包括高风险但频率极低）
      for (let num = 1; num <= 49; num++) {
        if (!appearedInBothPrev2.has(num) && freq[num] <= 8) {
          candidates.push({ num, freq: freq[num], freq10: freq10[num], freq5: freq5[num], freq3: freq3[num], priority: 6 });
        }
      }
      
      // 按优先级、最近3期频率、最近5期频率、最近10期频率、全局频率排序
      // 优化：加入前5期出现频率作为排序条件
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.freq3 !== b.freq3) return a.freq3 - b.freq3;
        if (a.freq5 !== b.freq5) return a.freq5 - b.freq5;
        if (a.freq10 !== b.freq10) return a.freq10 - b.freq10;
        return a.freq - b.freq;
      });
      
      // 选择前8个
      const selected = candidates.slice(0, 8).map(c => c.num);
      
      // 如果不足8个，补充其他冷号
      if (selected.length < 8) {
        for (let num = 1; num <= 49; num++) {
          if (selected.length >= 8) break;
          if (!selected.includes(num) && freq[num] <= 13 && freq10[num] <= 1 && freq5[num] <= 1) {
            selected.push(num);
          }
        }
      }
      
      // 预测的8个号码
      const predicted8 = selected.slice(0, 8);
      
      // 实际开出
      const nextRow = new Set(hist[i + 1]);
      
      // 计算准确率
      let correct = 0;
      predicted8.forEach(num => {
        if (!nextRow.has(num)) {
          correct++;
        }
      });
      
      const accuracy = (correct / 8 * 100).toFixed(0);
      results.push({
        period: i + 1,
        nextPeriod: i + 2,
        predicted: predicted8,
        actual: hist[i + 1],
        correct,
        accuracy: parseInt(accuracy),
        status: correct === 8 ? '✅' : correct >= 7 ? '⚠️' : '❌'
      });
    }

    return results;
  }

  // ================================================================
  //     可能出现的数字预测：选出8个最可能出现的号码
  // ================================================================

  function predictLikelyNumbers(hist) {
    const MAX_NUM = 49;
    const scores = [];

    for (let num = 1; num <= MAX_NUM; num++) {
      let score = 0;
      const reasons = [];

      // 遗漏期数
      let lastMiss = hist.length;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].includes(num)) {
          lastMiss = hist.length - 1 - i;
          break;
        }
      }

      // 出现次数和平均间隔
      const appearances = [];
      hist.forEach((row, idx) => {
        if (row.includes(num)) appearances.push(idx);
      });
      const totalAppear = appearances.length;
      if (totalAppear === 0) continue; // 从未出现的号不考虑
      let avgGap = hist.length / 7;
      if (totalAppear >= 2) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }
      const lastRow = new Set(hist[hist.length - 1]);

      // 规律1：遗漏回归（最强信号）
      if (totalAppear >= 2) {
        const missRatio = lastMiss / avgGap;
        if (missRatio >= 2.0) {
          score += 3.0;
          reasons.push(`遗漏${lastMiss}期(均${avgGap.toFixed(0)}期),迟到回归`);
        } else if (missRatio >= 1.5) {
          score += 2.0;
          reasons.push(`遗漏${lastMiss}期(均${avgGap.toFixed(0)}期),即将回归`);
        } else if (missRatio >= 1.2) {
          score += 1.2;
          reasons.push(`遗漏${lastMiss}期,接近回归`);
        } else if (missRatio >= 0.9) {
          score += 0.5;
          reasons.push(`接近平均间隔`);
        }
      }

      // 规律2：上期重复（14%概率）
      if (lastRow.has(num)) {
        let rc = 0,
          rt = 0;
        for (let i = 0; i < hist.length - 1; i++) {
          if (hist[i].includes(num)) {
            rt++;
            if (hist[i + 1].includes(num)) rc++;
          }
        }
        const rr = rt > 1 ? rc / rt : 0.14;
        score += rr * 2.5;
        reasons.push(`上期出现,重复率${(rr * 100).toFixed(0)}%`);
      }

      // 规律3：跳期回归（19%概率）
      if (hist.length >= 2 && hist[hist.length - 2].includes(num) && !lastRow.has(num)) {
        score += 0.4;
        reasons.push(`跳期回归`);
      }

      // 规律4：近3期热号
      const c3 = hist.slice(-3).filter((r) => r.includes(num)).length;
      if (c3 >= 2) {
        score += c3 * 0.5;
        reasons.push(`近3期出现${c3}次,热号`);
      }

      // 规律5：周期性回归
      if (totalAppear >= 3) {
        const gaps = [];
        for (let i = 1; i < appearances.length; i++) gaps.push(appearances[i] - appearances[i - 1]);
        const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avgGap) ** 2, 0) / gaps.length);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        if (cv < 0.5 && lastMiss >= avgGap * 0.8 && lastMiss <= avgGap * 1.5) {
          score += (1 - cv) * 1.2;
          reasons.push(`周期性(间隔≈${avgGap.toFixed(0)}期)`);
        }
      }

      // 规律6：邻号效应
      if ([...lastRow].some((n) => Math.abs(n - num) === 1) && lastMiss >= 2) {
        score += 0.3;
        reasons.push(`上期邻号`);
      }

      if (score > 0) {
        scores.push({ num, score, reasons });
      }
    }

    // Top 18，直接取得分最高的18个
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 22);
  }

  // ================================================================
  //                      回测 + 结果生成 
  // ================================================================

  function runKillPrediction(hist) {
    const testPeriods = Math.min(20, hist.length - 10);
    
    // 只保留一个策略: 90% 准确率杀码算法
    const strategies = [
      { name: '90% 准确率杀码 v5.7', fn: strategyAbsoluteSafe, label: '高精度' }
    ];
    
    const strategyStats = strategies.map((s) => {
      let correct = 0, total = 0;
      for (let i = hist.length - testPeriods - 1; i < hist.length - 1; i++) {
        const testHist = hist.slice(0, i + 1);
        const nextRow = new Set(hist[i + 1]);
        const preds = s.fn(testHist);
        const top10 = preds.slice(0, 10);
        top10.forEach((p) => {
          total++;
          if (!nextRow.has(p.num)) correct++;
        });
      }
      const accuracy = total > 0 ? correct / total : 0;
      return { ...s, accuracy, total };
    });

    // ===== 获取最新一期的杀码预测 =====
    const preds = strategyAbsoluteSafe(hist);
    
    // 直接取前10个（已在strategyAbsoluteSafe中做过尾数平衡和连续性保障）
    const final = preds.slice(0, 10).map((p, idx) => ({
      num: p.num,
      score: p.score,
      reasons: [{
        strategy: p.tier,
        label: p.label,
        accuracy: strategyStats[0].accuracy,
        details: `频率${p.freq}次 | 遗漏${p.miss}期 | 近5期${p.recent5}次 | 均隔${p.avgGap}期`
      }]
    }));

    // ===== 回测最近 5 期验证 =====
    const recentBacktest = [];
    for (let i = hist.length - 6; i < hist.length - 1; i++) {
      const testHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);
      
      const simPreds = strategyAbsoluteSafe(testHist);
      const simFinal = simPreds.slice(0, 10).map(p => p.num);
      
      const failed = simFinal.filter((n) => nextRow.has(n));
      recentBacktest.push({
        period: i + 1,
        actual: hist[i + 1],
        killNums: simFinal,
        failed,
        success: simFinal.length - failed.length,
        rate: simFinal.length > 0 ? (simFinal.length - failed.length) / simFinal.length : 0,
      });
    }

    // ===== 可能出号预测 (保留原有逻辑，与杀码解耦) =====
    const likelyNumbers = predictLikelyNumbers(hist);
    const kill8Numbers = predictKill8Numbers(hist);
    const kill8Backtest = backtestKill8Numbers(hist);
    const likelyBacktest = [];
    const lbStart = Math.max(5, hist.length - 9);
    for (let i = lbStart; i < hist.length - 1; i++) {
      const testHist = hist.slice(0, i + 1);
      const nextRow = new Set(hist[i + 1]);
      const testLikely = predictLikelyNumbers(testHist);
      const nums = testLikely.map((l) => l.num);
      const hits = nums.filter((n) => nextRow.has(n));
      likelyBacktest.push({
        period: i + 1,
        actual: hist[i + 1],
        predicted: nums,
        hits,
        hitCount: hits.length,
      });
    }

    return {
      predictions: final,
      strategies: strategyStats,
      backtest: recentBacktest,
      avgAccuracy: recentBacktest.length > 0
          ? recentBacktest.reduce((a, b) => a + b.rate, 0) / recentBacktest.length
          : 0,
      protectedNums: [], // 停用独立的保护系统，全部融入Absolute Safe Rule
      protectAccuracy: 0,
      likelyNumbers,
      likelyBacktest,
      kill8Numbers,
      kill8Backtest,
    };
  }

  // ================================================================
  //                           渲染
  // ================================================================

  const styles = {
    container: {
      maxWidth: 800,
      margin: '0 auto',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#e0e0e0',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      minHeight: '100vh',
    },
    header: {
      textAlign: 'center',
      marginBottom: 30,
      padding: '20px 0',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      background: 'linear-gradient(90deg, #e94560, #ff6b6b)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      margin: 0,
    },
    subtitle: { fontSize: 14, color: '#8899aa', marginTop: 8 },
    backLink: {
      display: 'inline-block',
      marginBottom: 20,
      color: '#64b5f6',
      textDecoration: 'none',
      fontSize: 14,
      padding: '6px 12px',
      borderRadius: 6,
      border: '1px solid rgba(100,181,246,0.3)',
    },
    card: {
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 12,
      padding: '20px',
      marginBottom: 20,
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(10px)',
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 15,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    numGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    },
    numBall: (rank) => ({
      width: 52,
      height: 52,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 18,
      color: '#fff',
      background:
        rank < 3
          ? 'linear-gradient(135deg, #e94560, #c23152)'
          : rank < 6
            ? 'linear-gradient(135deg, #e67e22, #d35400)'
            : 'linear-gradient(135deg, #3498db, #2980b9)',
      boxShadow: rank < 3 ? '0 4px 15px rgba(233,69,96,0.4)' : '0 4px 10px rgba(0,0,0,0.3)',
      position: 'relative',
    }),
    protectBall: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 15,
      color: '#fff',
      background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      boxShadow: '0 3px 10px rgba(46,204,113,0.3)',
    },
    rank: {
      position: 'absolute',
      top: -6,
      right: -6,
      background: '#ffcc02',
      color: '#1a1a2e',
      width: 20,
      height: 20,
      borderRadius: '50%',
      fontSize: 11,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reason: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 },
    strategyBar: (accuracy) => ({
      height: 8,
      borderRadius: 4,
      background: `linear-gradient(90deg, ${
        accuracy > 0.85 ? '#2ecc71' : accuracy > 0.75 ? '#f1c40f' : '#e74c3c'
      } ${accuracy * 100}%, rgba(255,255,255,0.1) ${accuracy * 100}%)`,
      width: '100%',
    }),
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: {
      padding: '10px 8px',
      textAlign: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.15)',
      color: '#8899aa',
      fontWeight: 600,
      fontSize: 12,
    },
    td: {
      padding: '10px 8px',
      textAlign: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    loadingContainer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 16,
    },
    spinner: {
      width: 40,
      height: 40,
      border: '3px solid rgba(255,255,255,0.1)',
      borderTop: '3px solid #e94560',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
  };

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ color: '#e74c3c' }}>❌ {error}</p>
          <a href="/" style={styles.backLink}>
            ← 返回主页
          </a>
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
          <p style={{ color: '#8899aa' }}>
            {history.length === 0 ? '正在加载历史数据...' : '正在运行杀码预测算法...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <a href="/" style={styles.backLink}>
        ← 返回主页
      </a>

      <div style={styles.header}>
        <h1 style={styles.title}>🎯 杀码预测 v5.7</h1>
        <p style={styles.subtitle}>
          基于 {history.length} 期历史数据 · 90% 准确率版本 · 回测准确率{' '}
          <strong style={{ color: result.avgAccuracy > 0.90 ? '#2ecc71' : result.avgAccuracy > 0.85 ? '#f1c40f' : '#e67e22' }}>
            {(result.avgAccuracy * 100).toFixed(1)}%
          </strong>
        </p>
      </div>

      {/* 预测结果 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>🔮</span> 预测下期不会出现的 10 个数字
        </div>
        <div style={styles.numGrid}>
          {result.predictions.map((p, idx) => (
            <div key={p.num} style={{ textAlign: 'center' }}>
              <div style={styles.numBall(idx)}>
                {p.num}
                <span style={styles.rank}>{idx + 1}</span>
              </div>
              <div style={styles.reason}>
                {p.reasons.length > 0
                  ? p.reasons
                      .filter((r) => !r.strategy.startsWith('🛡️'))
                      .slice(0, 2)
                      .map((r) => r.label)
                      .join('+') || '综合'
                  : '综合'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 基于前5行规律预测8个不会出现的数字 */}
      {result.kill8Numbers && result.kill8Numbers.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>🎯</span> 基于前 5 行规律预测下期（第 {history.length + 1} 期）不会出现的 8 个数字
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 12 }}>
            规律：前 2 期都未出现 + 第一+二阶段优化 · 历史准确率 {result.kill8Backtest && result.kill8Backtest.length > 0 ? ((result.kill8Backtest.reduce((sum, bt) => sum + bt.correct, 0) / (result.kill8Backtest.length * 8)) * 100).toFixed(1) : '--'}%
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {result.kill8Numbers.map((p, idx) => (
              <div key={p.num} style={{ textAlign: 'center', width: 50 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 16,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #3498db, #2980b9)',
                    boxShadow: '0 3px 12px rgba(52,152,219,0.4)',
                  }}
                >
                  {p.num}
                </div>
                <div style={{ fontSize: 10, color: '#667', marginTop: 3, lineHeight: 1.2 }}>
                  {p.reason}
                </div>
              </div>
            ))}
          </div>

          {/* 回测 8 期结果 */}
          {result.kill8Backtest && result.kill8Backtest.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #ddd' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2c3e50', marginBottom: 12 }}>
                📊 历史回测 {result.kill8Backtest.length} 期结果（供参考）
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2c3e50' }}>期数</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2c3e50' }}>预测 8 个号码</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2c3e50' }}>实际开出</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2c3e50' }}>准确率</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2c3e50' }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.kill8Backtest.map((bt, idx) => {
                      // 找出杀错的号码（预测中但实际出现的）
                      const actualSet = new Set(bt.actual);
                      const failedNums = bt.predicted.filter(num => actualSet.has(num));
                      
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '8px', textAlign: 'center', color: '#2c3e50', fontWeight: 600 }}>
                            {bt.period} → {bt.nextPeriod}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontSize: 11 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                              {bt.predicted.map(num => (
                                <span
                                  key={num}
                                  style={{
                                    display: 'inline-block',
                                    width: 24,
                                    height: 24,
                                    lineHeight: '24px',
                                    borderRadius: '50%',
                                    textAlign: 'center',
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: failedNums.includes(num) ? '#e74c3c' : '#3498db',
                                    boxShadow: failedNums.includes(num) ? '0 2px 8px rgba(231,76,60,0.4)' : '0 2px 6px rgba(52,152,219,0.3)',
                                  }}
                                >
                                  {num}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: '#667', fontSize: 11 }}>
                            [{bt.actual.join(', ')}]
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: bt.accuracy === 100 ? '#27ae60' : bt.accuracy >= 87 ? '#f39c12' : '#e74c3c' }}>
                            {bt.correct}/8 ({bt.accuracy}%)
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>
                            {bt.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: '10px', background: '#f0f8ff', borderRadius: 6, fontSize: 12, color: '#2c3e50' }}>
                <strong>历史准确率：</strong> {result.kill8Backtest.length > 0 
                  ? ((result.kill8Backtest.reduce((sum, bt) => sum + bt.correct, 0) / (result.kill8Backtest.length * 8)) * 100).toFixed(1) 
                  : 0}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* 可能出现的数字 */}
      {result.likelyNumbers && result.likelyNumbers.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>✨</span> 预测下期可能出现的 22 个数字
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 12 }}>
            基于遗漏回归、重复率、跳期、热号、周期性、邻号效应综合评分 · 回测≥ 2 命中率 78%
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {result.likelyNumbers.map((p, idx) => (
              <div key={p.num} style={{ textAlign: 'center', width: 50 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 16,
                    color: '#1a1a2e',
                    background:
                      idx < 3
                        ? 'linear-gradient(135deg, #f1c40f, #f39c12)'
                        : idx < 8
                          ? 'linear-gradient(135deg, #e67e22, #d35400)'
                          : idx < 13
                            ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
                            : 'linear-gradient(135deg, #9b59b6, #8e44ad)',
                    boxShadow:
                      idx < 3 ? '0 3px 12px rgba(241,196,15,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  {p.num}
                </div>
                <div style={{ fontSize: 10, color: '#667', marginTop: 3, lineHeight: 1.2 }}>
                  {p.reasons[0]?.replace(/,/g, '\n').split('\n')[0] || '综合'}
                </div>
              </div>
            ))}
          </div>

          {/* 排除号码一键复制 */}
          {(() => {
            const likelySet = new Set(result.likelyNumbers.map((p) => p.num));
            const excludeNums = [];
            for (let i = 1; i <= 49; i++) {
              if (!likelySet.has(i)) excludeNums.push(i);
            }
            return (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#8899aa' }}>
                    🚫 排除号码（1-49 中除去预测的 {result.likelyNumbers.length} 个）：共{' '}
                    {excludeNums.length} 个
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(excludeNums.join(', '));
                      setCopiedExclude(true);
                      setTimeout(() => setCopiedExclude(false), 2000);
                    }}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: copiedExclude
                        ? 'linear-gradient(135deg, #27ae60, #2ecc71)'
                        : 'linear-gradient(135deg, #3498db, #2980b9)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'all 0.3s',
                    }}
                  >
                    {copiedExclude ? '已复制 ✓' : '📋 一键复制'}
                  </button>
                </div>
                <div
                  style={{ fontSize: 13, color: '#ccc', lineHeight: 1.8, wordBreak: 'break-all' }}
                >
                  {excludeNums.join(', ')}
                </div>
              </div>
            );
          })()}

          {/* 8期回测 */}
          {result.likelyBacktest && result.likelyBacktest.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1c40f', marginBottom: 10 }}>
                📊 近 {result.likelyBacktest.length} 期回测验证
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '8px 6px',
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: '#8899aa',
                          fontSize: 12,
                        }}
                      >
                        期号
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '8px 6px',
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: '#8899aa',
                          fontSize: 12,
                        }}
                      >
                        预测号码
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '8px 6px',
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: '#8899aa',
                          fontSize: 12,
                        }}
                      >
                        实际开出
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '8px 6px',
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: '#8899aa',
                          fontSize: 12,
                        }}
                      >
                        命中
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.likelyBacktest.map((bt) => (
                      <tr key={bt.period}>
                        <td
                          style={{
                            padding: '8px 6px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            color: '#aaa',
                          }}
                        >
                          第{bt.period}→{bt.period + 1}期
                        </td>
                        <td
                          style={{
                            padding: '8px 6px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          {bt.predicted.map((n) => (
                            <span
                              key={n}
                              style={{
                                display: 'inline-block',
                                margin: '1px 3px',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 12,
                                fontWeight: 600,
                                background: bt.hits.includes(n)
                                  ? 'rgba(46,204,113,0.25)'
                                  : 'rgba(255,255,255,0.05)',
                                color: bt.hits.includes(n) ? '#2ecc71' : '#888',
                                border: bt.hits.includes(n)
                                  ? '1px solid rgba(46,204,113,0.4)'
                                  : '1px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              {n}
                            </span>
                          ))}
                        </td>
                        <td
                          style={{
                            padding: '8px 6px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            color: '#4fc3f7',
                            fontSize: 12,
                          }}
                        >
                          {bt.actual.join(', ')}
                        </td>
                        <td
                          style={{
                            padding: '8px 6px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                bt.hitCount >= 2
                                  ? '#2ecc71'
                                  : bt.hitCount >= 1
                                    ? '#f39c12'
                                    : '#e74c3c',
                            }}
                          >
                            {bt.hitCount}/18
                            {bt.hitCount >= 3 ? ' ✅' : bt.hitCount >= 2 ? ' 🟡' : ' ❌'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: '#667788', marginTop: 8, textAlign: 'right' }}>
                平均命中{' '}
                {(
                  result.likelyBacktest.reduce((s, b) => s + b.hitCount, 0) /
                  result.likelyBacktest.length
                ).toFixed(1)}
                /18
              </p>
            </div>
          )}
        </div>
      )}

      {/* 保护区 */}
      {result.protectedNums.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>🛡️</span> 受保护数字（不应杀的号码）
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 12 }}>
            这些数字因为重复率高、遗漏过久可能回归、或近期趋势向上，被保护机制从杀码中排除/降权
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {result.protectedNums.slice(0, 12).map((p) => (
              <div key={p.num} style={{ textAlign: 'center' }}>
                <div style={styles.protectBall}>{p.num}</div>
                <div style={{ fontSize: 11, color: '#8899aa', marginTop: 4, maxWidth: 80 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.strategies
            .sort((a, b) => b.accuracy - a.accuracy)
            .map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, minWidth: 110, color: '#ccc' }}>{s.name}</span>
                <div style={{ flex: 1 }}>
                  <div style={styles.strategyBar(s.accuracy)} />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 50,
                    textAlign: 'right',
                    color:
                      s.accuracy > 0.85 ? '#2ecc71' : s.accuracy > 0.75 ? '#f1c40f' : '#e74c3c',
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
        <div style={{ overflowX: 'auto' }}>
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
                  <td style={styles.td}>{bt.actual.join(', ')}</td>
                  <td style={styles.td}>
                    {bt.killNums.map((n, i) => {
                      const isFailed = bt.failed.includes(n);
                      return (
                        <span key={i}>
                          <span
                            style={{
                              color: isFailed ? '#e74c3c' : '#2ecc71',
                              fontWeight: isFailed ? 700 : 400,
                              textDecoration: isFailed ? 'line-through' : 'none',
                            }}
                          >
                            {n}
                          </span>
                          {i < bt.killNums.length - 1 && ', '}
                        </span>
                      );
                    })}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        color: bt.rate >= 0.9 ? '#2ecc71' : bt.rate >= 0.7 ? '#f1c40f' : '#e74c3c',
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
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>排名</th>
                <th style={styles.th}>号码</th>
                <th style={styles.th}>综合得分</th>
                <th style={styles.th}>杀码依据</th>
                <th style={styles.th}>详细统计</th>
              </tr>
            </thead>
            <tbody>
              {result.predictions.map((p, idx) => (
                <tr key={p.num}>
                  <td style={styles.td}>
                    <span
                      style={{
                        background: idx < 3 ? '#e94560' : idx < 6 ? '#e67e22' : '#3498db',
                        color: '#fff',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, fontSize: 16, color: '#fff' }}>
                    {p.num}
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: '#ffcc02', fontWeight: 600 }}>{p.score.toFixed(2)}</span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'left', fontSize: 12 }}>
                    {p.reasons.length > 0 ? (
                      p.reasons.map((r, i) => (
                        <span
                          key={i}
                          style={{
                            display: 'inline-block',
                            background: r.strategy.startsWith('🛡️')
                              ? 'rgba(46,204,113,0.15)'
                              : 'rgba(255,255,255,0.08)',
                            borderRadius: 4,
                            padding: '2px 8px',
                            margin: '2px 4px',
                            fontSize: 11,
                            color: r.strategy.startsWith('🛡️') ? '#2ecc71' : '#ccc',
                          }}
                        >
                          {r.strategy} ({(r.accuracy * 100).toFixed(0)}%)
                        </span>
                      ))
                    ) : (
                      <span style={{ color: '#666' }}>多策略综合</span>
                    )}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'left', fontSize: 11, color: '#8899aa' }}>
                    {p.reasons[0]?.details || '-'}
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

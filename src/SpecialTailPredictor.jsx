import React, { useEffect, useMemo, useState } from 'react';

const DIGITS = Array.from({ length: 10 }, (_, i) => i);
const WINDOWS = [20, 50, 100];

const toPct = (value) => `${(value * 100).toFixed(1)}%`;

const normalizeRows = (data) =>
  (Array.isArray(data) ? data : [])
    .map((item, index) => {
      const numbers = [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);
      return {
        id: item.id ?? index,
        year: Number(item.year) || 0,
        No: Number(item.No) || index + 1,
        numbers,
        special: numbers[6],
        tail: numbers[6] % 10,
      };
    })
    .filter((row) => row.numbers.length === 7)
    .sort((a, b) => a.year - b.year || a.No - b.No || a.id - b.id);

const countTails = (rows) => {
  const counts = Array(10).fill(0);
  rows.forEach((row) => {
    counts[row.tail] += 1;
  });
  return counts;
};

const scoreDigits = (history, t, mode) => {
  const past = history.slice(0, t);
  const tails = past.map((row) => row.tail);
  const lastTail = tails[tails.length - 1] ?? 0;
  const prevTail = tails[tails.length - 2] ?? lastTail;
  const prev2Tail = tails[tails.length - 3] ?? prevTail;
  const recent5 = countTails(past.slice(-5));
  const recent10 = countTails(past.slice(-10));
  const recent20 = countTails(past.slice(-20));
  const recent30 = countTails(past.slice(-30));
  const recent50 = countTails(past.slice(-50));
  const recent100 = countTails(past.slice(-100));
  const all = countTails(past);
  const transition = Array(10).fill(0);
  const pairTransition = Array(10).fill(0);
  const diffCounts = Array(10).fill(0);
  const lastDiff = (lastTail - prevTail + 10) % 10;
  const prevDiff = (prevTail - prev2Tail + 10) % 10;

  for (let i = 1; i < tails.length; i += 1) {
    if (tails[i - 1] === lastTail) transition[tails[i]] += 1;
    diffCounts[(tails[i] - tails[i - 1] + 10) % 10] += 1;
  }
  for (let i = 2; i < tails.length; i += 1) {
    if (tails[i - 2] === prevTail && tails[i - 1] === lastTail) pairTransition[tails[i]] += 1;
  }

  return DIGITS.map((digit) => {
    let miss = past.length;
    for (let i = past.length - 1; i >= 0; i -= 1) {
      if (past[i].tail === digit) {
        miss = past.length - 1 - i;
        break;
      }
    }

    const mirror = digit === (10 - lastTail) % 10 ? 1 : 0;
    const repeat = digit === lastTail ? 1 : 0;
    const lastStep = digit === (lastTail + lastDiff) % 10 ? 1 : 0;
    const prevStep = digit === (lastTail + prevDiff) % 10 ? 1 : 0;
    const neighbor = Math.abs(digit - lastTail) === 1 || Math.abs(digit - lastTail) === 9 ? 1 : 0;
    const shortHot = recent5[digit] * 1.5 + recent10[digit] * 0.9 + recent20[digit] * 0.45;
    const midHot = recent20[digit] * 0.6 + recent30[digit] * 0.45 + recent50[digit] * 0.25;
    const longHot = recent50[digit] * 0.35 + recent100[digit] * 0.2 + all[digit] * 0.045;
    const cold = miss * 0.75 - recent5[digit] * 1.1 - recent10[digit] * 0.55 - recent20[digit] * 0.2;
    const markov = transition[digit] * 1.8 + pairTransition[digit] * 3.2;
    const rhythm =
      lastStep * 1.7 +
      prevStep * 0.8 +
      mirror * 0.7 +
      repeat * 0.35 +
      neighbor * 0.25 +
      diffCounts[(digit - lastTail + 10) % 10] * 0.12;
    const gapSweet =
      (miss >= 2 && miss <= 9 ? 1.2 : 0) + (miss >= 10 && miss <= 18 ? 0.8 : 0) - (miss === 0 ? 1.2 : 0);

    const scores = {
      recentHot: shortHot,
      longHot,
      overdue: cold,
      transition: markov + rhythm,
      balance: midHot * 0.28 + longHot * 0.18 + cold * 0.18 + markov * 0.24 + rhythm * 0.08 + gapSweet * 0.04,
      contrarian: cold * 0.45 + markov * 0.25 + longHot * 0.18 - recent5[digit] * 0.65,
      antiHot: cold * 0.35 + markov * 0.3 + rhythm * 0.2 + midHot * 0.15 - recent5[digit] * 0.8,
      repeatPattern: rhythm * 0.45 + markov * 0.35 + longHot * 0.12 + gapSweet * 0.08,
      hybrid: shortHot * 0.22 + longHot * 0.24 + cold * 0.2 + markov * 0.24 + rhythm * 0.1,
    };

    return {
      digit,
      score: scores[mode] ?? scores.hybrid,
      miss,
      recent20: recent20[digit],
      recent50: recent50[digit],
      transition: transition[digit] + pairTransition[digit],
    };
  }).sort((a, b) => b.score - a.score || b.miss - a.miss || a.digit - b.digit);
};

const predictByMode = (history, t, mode) => scoreDigits(history, t, mode).slice(0, 5);

const evaluateMode = (history, t, mode, lookback) => {
  const start = Math.max(8, t - lookback);
  let hits = 0;
  let trials = 0;
  for (let i = start; i < t; i += 1) {
    const picked = predictByMode(history, i, mode).map((item) => item.digit);
    if (picked.includes(history[i].tail)) hits += 1;
    trials += 1;
  }
  return { hits, trials, rate: trials ? hits / trials : 0 };
};

const chooseAdaptiveMode = (history, t, modes) => {
  const ranked = modes
    .map((mode) => {
      const recent20 = evaluateMode(history, t, mode, 20);
      const recent50 = evaluateMode(history, t, mode, 50);
      const score = recent20.rate * 0.65 + recent50.rate * 0.35 + Math.min(recent20.trials, 20) * 0.001;
      return { mode, recent20, recent50, score };
    })
    .sort((a, b) => b.score - a.score || b.recent20.rate - a.recent20.rate);
  return ranked[0];
};

const chooseBestCurrentMode = (history, modes) => {
  const t = history.length;
  return modes
    .map((mode) => {
      const recent20 = evaluateMode(history, t, mode, 20);
      const recent50 = evaluateMode(history, t, mode, 50);
      const recent100 = evaluateMode(history, t, mode, 100);
      const score = recent20.rate * 0.6 + recent50.rate * 0.28 + recent100.rate * 0.12;
      return { mode, recent20, recent50, recent100, score };
    })
    .sort((a, b) => b.score - a.score || b.recent20.rate - a.recent20.rate || b.recent50.rate - a.recent50.rate)[0];
};

const runModeBacktest = (history, mode, count) => {
  const start = Math.max(12, history.length - count);
  const rows = [];
  let hits = 0;
  for (let t = start; t < history.length; t += 1) {
    const prediction = predictByMode(history, t, mode).map((item) => item.digit);
    const hit = prediction.includes(history[t].tail);
    if (hit) hits += 1;
    rows.push({
      year: history[t].year,
      No: history[t].No,
      special: history[t].special,
      tail: history[t].tail,
      mode,
      prediction,
      hit,
    });
  }
  return {
    count: rows.length,
    hits,
    rate: rows.length ? hits / rows.length : 0,
    rows: rows.reverse(),
  };
};

const describeMode = (mode) =>
  ({
    recentHot: '短期热尾优先',
    longHot: '长期高频优先',
    overdue: '遗漏回补优先',
    transition: '上期转移优先',
    balance: '均衡评分',
    contrarian: '冷尾反向评分',
    antiHot: '反热转移评分',
    repeatPattern: '节奏转移评分',
    hybrid: '混合评分',
  })[mode] || mode;

export default function SpecialTailPredictor() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validationWindow, setValidationWindow] = useState(50);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/history');
        if (!res.ok) throw new Error(`历史接口返回 ${res.status}`);
        const rows = normalizeRows(await res.json());
        if (rows.length < 20) throw new Error('历史数据不足，至少需要 20 期');
        setHistory(rows);
      } catch (err) {
        setError(err.message || '加载历史数据失败');
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  const report = useMemo(() => {
    if (history.length < 20) return null;
    const modes = [
      'contrarian',
      'antiHot',
      'repeatPattern',
      'overdue',
      'transition',
      'hybrid',
      'balance',
      'recentHot',
      'longHot',
    ];
    const chosen = chooseBestCurrentMode(history, modes);
    const prediction = predictByMode(history, history.length, chosen.mode);
    const backtests = WINDOWS.map((count) => runModeBacktest(history, chosen.mode, count));
    const adaptiveBacktests = WINDOWS.map((count) => {
      const start = Math.max(12, history.length - count);
      let hits = 0;
      for (let t = start; t < history.length; t += 1) {
        const adaptive = chooseAdaptiveMode(history, t, modes);
        const picked = predictByMode(history, t, adaptive.mode).map((item) => item.digit);
        if (picked.includes(history[t].tail)) hits += 1;
      }
      return { count: history.length - start, hits, rate: (history.length - start) ? hits / (history.length - start) : 0 };
    });
    const modeStats = modes
      .map((mode) => ({ mode, ...evaluateMode(history, history.length, mode, validationWindow) }))
      .sort((a, b) => b.rate - a.rate || b.hits - a.hits);
    const latest = history[history.length - 1];

    return {
      latest,
      chosen,
      prediction,
      backtests,
      adaptiveBacktests,
      modeStats,
      recentRows: backtests[0]?.rows || [],
    };
  }, [history, validationWindow]);

  const bestRate = report ? Math.max(...report.backtests.map((item) => item.rate)) : 0;
  const reaches90 = bestRate >= 0.9;

  return (
    <div className="special-tail-page">
      <header className="special-tail-hero">
        <div>
          <p className="special-tail-kicker">特别号尾数预测</p>
          <h1>下期 5 个尾数</h1>
          <p className="special-tail-copy">
            读取数据库接口 /api/history 的历史开奖，取每期最后一个号码作为特别号，用滚动回测自动选择当前最稳的尾数策略。
          </p>
        </div>
        <div className="special-tail-status">
          {loading ? '加载中' : error ? '接口异常' : `已加载 ${history.length} 期`}
        </div>
      </header>

      {error && <div className="special-tail-alert">无法加载：{error}</div>}

      {!loading && !error && report && (
        <>
          <section className="special-tail-grid">
            <div className="special-tail-panel special-tail-main">
              <div className="special-tail-panel-head">
                <div>
                  <span>推荐尾数</span>
                  <strong>{describeMode(report.chosen.mode)}</strong>
                </div>
                <small>
                  最新：{report.latest.year || '--'} 年第 {report.latest.No || '--'} 期，特别号 {report.latest.special}
                </small>
              </div>
              <div className="special-tail-digits">
                {report.prediction.map((item) => (
                  <div className="special-tail-digit" key={item.digit}>
                    <b>{item.digit}</b>
                    <span>近20出 {item.recent20} · 遗漏 {item.miss}</span>
                  </div>
                ))}
              </div>
              <div className="special-tail-note">
                {reaches90
                  ? `当前回测窗口最高达到 ${toPct(bestRate)}。`
                  : `目前历史回测最高为 ${toPct(bestRate)}，5 选 1 尾数要长期稳定到 90% 以上很难，页面会按真实回测动态更新。`}
                {' '}滚动择优近20/50/100为 {report.adaptiveBacktests.map((item) => toPct(item.rate)).join(' / ')}。
              </div>
            </div>

            <div className="special-tail-panel">
              <div className="special-tail-panel-head">
                <div>
                  <span>策略验证</span>
                  <strong>近 {validationWindow} 期</strong>
                </div>
                <select value={validationWindow} onChange={(e) => setValidationWindow(Number(e.target.value))}>
                  <option value={20}>近 20 期</option>
                  <option value={50}>近 50 期</option>
                  <option value={100}>近 100 期</option>
                </select>
              </div>
              <div className="special-tail-mode-list">
                {report.modeStats.slice(0, 5).map((item) => (
                  <div className="special-tail-mode" key={item.mode}>
                    <span>{describeMode(item.mode)}</span>
                    <b>{toPct(item.rate)}</b>
                    <small>
                      {item.hits}/{item.trials}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="special-tail-backtests">
            {report.backtests.map((item) => (
              <div className="special-tail-card" key={item.count}>
                <span>近 {item.count} 期回测</span>
                <strong>{toPct(item.rate)}</strong>
                <small>
                  命中 {item.hits} / {item.count}
                </small>
              </div>
            ))}
          </section>

          <section className="special-tail-panel">
            <div className="special-tail-panel-head">
              <div>
                <span>最近回测明细</span>
                <strong>近 20 期</strong>
              </div>
            </div>
            <div className="special-tail-table">
              <div className="special-tail-row special-tail-row-head">
                <span>期号</span>
                <span>预测尾数</span>
                <span>实际</span>
                <span>结果</span>
              </div>
              {report.recentRows.slice(0, 20).map((row) => (
                <div className="special-tail-row" key={`${row.year}-${row.No}`}>
                  <span>
                    {row.year}-{row.No}
                  </span>
                  <span>{row.prediction.join(' ')}</span>
                  <span>
                    {row.special} 尾 {row.tail}
                  </span>
                  <span className={row.hit ? 'is-hit' : 'is-miss'}>{row.hit ? '命中' : '未中'}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";

/* ================= 内置历史数据 ================= */

const DEFAULT_HISTORY = `
49,4,9,17,10,43,16
6,39,32,4,7,2,37
46,18,47,35,3,1,14
3,29,10,39,49,22,38
29,44,37,19,26,38,23
19,43,20,15,8,37,4
20,29,40,42,17,25,24
5,10,3,6,1,32,18
26,22,20,30,46,7,6
29,22,16,31,21,17,45
33,40,20,48,34,7,28
28,8,34,25,24,10,23
46,6,34,17,33,29,47
48,28,29,36,46,19,9
49,30,31,38,10,28,15
12,2,33,5,17,49,4
23,4,46,11,33,31,19
13,44,9,21,31,22,37
28,34,13,8,22,15,3
46,13,44,37,45,19,17
20,37,32,1,11,6,36
42,24,2,22,47,21,26
44,23,45,30,19,8,26
43,31,36,11,37,27,6
35,29,41,33,1,49,46
34,35,46,31,13,3,44
20,6,15,10,13,42,17
13,44,42,24,32,14,9
41,48,34,15,25,10,8
24,22,40,36,39,31,48
45,17,15,28,22,10,16
5,34,42,7,35,12,6
41,19,17,25,24,8,4
11,21,42,10,47,40,27
41,23,9,11,32,3,24
11,26,40,46,34,20,3
30,8,26,37,28,24,13
31,26,44,21,22,34,16
33,11,39,4,40,46,22
7,22,42,35,16,47,49
16,15,3,12,10,11,4
25,9,29,26,10,2,44
38,6,16,46,26,48,1
21,15,4,5,28,48,30
43,9,6,28,15,30,8
40,11,8,36,13,3,24
41,35,2,13,43,24,49
`;

/* ================= 工具 ================= */

const parse = txt =>
  txt
    .trim()
    .split("\n")
    .map(l => l.split(/[, ]+/).map(Number))
    .filter(r => r.length === 7);

/* ================= 核心算法（概率采样） ================= */

const smartPick = history => {
  const rows = history.length;
  const freq = Array(50).fill(0);
  history.flat().forEach(n => freq[n]++);

  const scores = [];

  for (let n = 1; n <= 49; n++) {
    const longFreq = freq[n] / (rows * 7);

    const recent = history.slice(-15);
    const shortFreq =
      recent.flat().filter(x => x === n).length / (recent.length * 7 || 1);

    let lastSeen = rows;
    for (let i = rows - 1; i >= 0; i--) {
      if (history[i].includes(n)) {
        lastSeen = rows - i;
        break;
      }
    }
    const coldness = Math.min(lastSeen / rows, 1);
    const antiHot = 1 - shortFreq;

    const score =
      0.35 * shortFreq +
      0.25 * longFreq +
      0.25 * coldness +
      0.15 * antiHot;

    scores.push({ n, score });
  }

  const sum = scores.reduce((s, x) => s + x.score, 0);
  scores.forEach(s => (s.p = s.score / sum));

  const res = [];
  while (res.length < 7) {
    const r = Math.random();
    let acc = 0;
    for (const s of scores) {
      acc += s.p;
      if (r <= acc && !res.includes(s.n)) {
        res.push(s.n);
        break;
      }
    }
  }
  return res.sort((a, b) => a - b);
};

/* ================= 回测 ================= */

const backtest = history => {
  let tests = 0;
  let anyHit = 0;

  for (let i = 20; i < history.length - 1; i++) {
    const past = history.slice(0, i);
    const real = history[i];
    const pick = smartPick(past);
    const hit = pick.filter(n => real.includes(n)).length;
    tests++;
    if (hit > 0) anyHit++;
  }

  return {
    tests,
    hitRate: ((anyHit / tests) * 100).toFixed(2)
  };
};

/* ================= React 组件 ================= */

export default function LotteryPredictor() {
  const [text, setText] = useState(DEFAULT_HISTORY);
  const [count, setCount] = useState(5);

  const history = useMemo(() => parse(text), [text]);

  const picks = useMemo(() => {
    if (history.length < 20) return [];
    return Array.from({ length: count }, () => smartPick(history));
  }, [history, count]);

  const stats = useMemo(() => {
    if (history.length < 30) return null;
    return backtest(history);
  }, [history]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h2>🎯 智能选号（多算法 + 回测）</h2>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ width: "100%", height: 220, fontFamily: "monospace" }}
      />

      <div style={{ marginTop: 10 }}>
        生成注数：
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={e => setCount(+e.target.value)}
          style={{ marginLeft: 8, width: 80 }}
        />
      </div>

      <h3 style={{ marginTop: 20 }}>✅ 推荐号码</h3>
      {picks.map((p, i) => (
        <div key={i} style={{ fontSize: 18 }}>
          第 {i + 1} 注：{p.join(" , ")}
        </div>
      ))}

      {stats && (
        <div
          style={{
            marginTop: 30,
            padding: 16,
            background: "#f6f8fa",
            borderRadius: 6
          }}
        >
          <h3>📊 历史回测（真实）</h3>
          <p>测试期数：{stats.tests}</p>
          <p>至少命中 1 个号码概率：{stats.hitRate}%</p>
          <p style={{ fontSize: 12, color: "#666" }}>
            ⚠️ 回测仅用于验证是否明显劣于随机，不代表未来收益
          </p>
        </div>
      )}
    </div>
  );
}

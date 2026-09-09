/** Frozen ranking configuration from the 2026 experiment. Weights learn after each draw. */
export const RISK_FEATURES = [
  '基础项',
  '近5期频率',
  '近10期频率',
  '近20期频率',
  '近40期频率',
  '20期升降温',
  '5期变化速度',
  '遗漏',
  '上期出现',
  '历史间隔偏离',
  '历史频率',
  '相邻期关系',
  '趋势与遗漏',
  '短期集中程度',
] as const;

export type RiskDraw = { year: number; No: number; numbers: number[] };
export type RiskAuditRow = RiskDraw & {
  predictedNumber: number;
  success: boolean;
  specialCodeMiss: boolean;
};

const BASE = 1 / 7;
const clip = (v: number) => Math.max(-3, Math.min(3, v));

export function computeOnlineRisk(history: RiskDraw[]) {
  const sets = history.map((r) => new Set(r.numbers));
  const weights = Array<number>(RISK_FEATURES.length).fill(0);
  const last = Array<number>(50).fill(-1);
  const counts = Array<number>(50).fill(0);
  const transitions = Array.from({ length: 50 }, () =>
    Array<number>(50).fill(0),
  );
  const denominators = Array<number>(50).fill(0);
  const rows: RiskAuditRow[] = [];
  const weightHistory: Array<{ afterNo: number; weights: number[] }> = [];
  let prediction: {
    number: number;
    ranking: Array<{ number: number; score: number }>;
    features: Array<{
      name: string;
      value: number;
      weight: number;
      contribution: number;
    }>;
  } | null = null;

  for (let t = 0; t <= history.length; t++) {
    if (t >= 40) {
      const windows = [5, 10, 20, 40];
      const windowCounts = new Map<number, number[]>();
      for (const window of windows) {
        const frequency = Array<number>(50).fill(0);
        for (let j = t - window; j < t; j++) {
          for (const number of history[j].numbers) frequency[number]++;
        }
        windowCounts.set(window, frequency);
      }
      const X = Array.from({ length: 49 }, (_, index) => {
        const n = index + 1;
        const count = (w: number) => windowCounts.get(w)![n];
        const z = (w: number) =>
          (count(w) - w * BASE) / Math.sqrt(w * BASE * (1 - BASE));
        const trend =
          (2 * count(20) - count(40)) / Math.sqrt(40 * BASE * (1 - BASE));
        const acceleration =
          (2 * count(5) - count(10)) / Math.sqrt(10 * BASE * (1 - BASE));
        const age = last[n] >= 0 ? t - 1 - last[n] : t;
        const ageZ = (Math.log1p(age) - 1.5) / 1.2;
        const hits: number[] = [];
        for (let j = Math.max(0, t - 60); j < t; j++)
          if (sets[j].has(n)) hits.push(j);
        const gap =
          hits.length > 1
            ? (hits[hits.length - 1] - hits[0]) / (hits.length - 1)
            : 7;
        const historical = ((counts[n] + 7) / (t + 49) - BASE) / 0.05;
        const transition =
          history[t - 1].numbers.reduce(
            (sum, a) =>
              sum + (transitions[a][n] + 50 * BASE) / (denominators[a] + 50),
            0,
          ) / 7;
        return [
          1,
          ...windows.map((w) => clip(z(w))),
          clip(trend),
          clip(acceleration),
          clip(ageZ),
          Number(sets[t - 1].has(n)),
          clip((age - gap) / 7),
          clip(historical),
          clip((transition - BASE) / 0.05),
          clip(trend * ageZ),
          clip(z(10) * Math.abs(z(10))),
        ];
      });
      const scores = X.map((x) =>
        x.reduce((sum, v, k) => sum + v * weights[k], 0),
      );
      const maxScore = Math.max(...scores);
      const exp = scores.map((s) => Math.exp(s - maxScore));
      const total = exp.reduce((sum, v) => sum + v, 0);
      const probabilities = exp.map((v) => v / total);
      // Stable number-order tie break, matching the research implementation.
      const chosen = scores.reduce(
        (best, v, j) => (v < scores[best] ? j : best),
        0,
      );
      if (t === history.length) {
        prediction = {
          number: chosen + 1,
          ranking: scores
            .map((score, j) => ({ number: j + 1, score }))
            .sort((a, b) => a.score - b.score || a.number - b.number),
          features: RISK_FEATURES.map((name, k) => ({
            name,
            value: X[chosen][k],
            weight: weights[k],
            contribution: X[chosen][k] * weights[k],
          })),
        };
        break;
      }

      // Record the prediction before reading the target draw into the gradient.
      rows.push({
        ...history[t],
        predictedNumber: chosen + 1,
        success: !sets[t].has(chosen + 1),
        specialCodeMiss: history[t].numbers[6] !== chosen + 1,
      });
      const errors = probabilities.map(
        (p, j) => p - (sets[t].has(j + 1) ? 1 / 7 : 0),
      );
      const gradients = weights.map((_, k) =>
        X.reduce((sum, x, j) => sum + errors[j] * x[k], 0),
      );
      for (let k = 0; k < weights.length; k++)
        weights[k] = weights[k] * (k === 0 ? 1 : 0.97) - 0.03 * gradients[k];
      weightHistory.push({ afterNo: history[t].No, weights: [...weights] });
    }
    if (t < history.length) {
      if (t > 0) {
        for (const a of history[t - 1].numbers) {
          denominators[a]++;
          for (const n of history[t].numbers) transitions[a][n]++;
        }
      }
      for (const n of history[t].numbers) {
        last[n] = t;
        counts[n]++;
      }
    }
  }
  return { rows, prediction, weightHistory };
}

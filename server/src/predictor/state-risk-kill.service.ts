import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { summarizeKillBacktest } from './kill-backtest-summary';

type DrawRow = { id?: number; year?: number; No?: number; numbers: number[] };
type State = {
  miss: number;
  f5: number;
  f20: number;
  phase: number;
  trend: number;
  raw: { miss: number; f5: number; f20: number; f50: number; phase: number; lastGap: number };
};
type Counts = Map<string | number, [number, number]>;

@Injectable()
export class StateRiskKillService {
  private readonly learningWindow = 240;
  private readonly selectedRank = 5;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const raw = await this.historyService.findAll();
    const history = this.normalizeRows(raw);
    if (history.length < 300) {
      return { status: 'insufficient-history', historyCount: history.length, message: '状态条件风险模型至少需要300期历史。' };
    }

    const matrix = history.map((row) => row.numbers);
    const features = this.buildFeatures(matrix);
    const prediction = this.pick(matrix, features, matrix.length);
    const backtest20 = this.backtest(history, matrix, features, 20);
    const backtest50 = this.backtest(history, matrix, features, 50);
    const backtest100 = this.backtest(history, matrix, features, 100);
    const backtest200 = this.backtest(history, matrix, features, 200);

    return {
      status: [backtest20, backtest50, backtest100].every((item) => item.successRate >= 0.9) ? 'stable' : 'watch',
      strategy: {
        key: 'stateRisk240Position5',
        name: '状态条件风险第5位',
        learningWindow: this.learningWindow,
        selectedRank: this.selectedRank,
        description: '用遗漏区间、近5/20期频次、间隔相位和冷热转折学习下一期条件出号风险；经贝叶斯平滑后固定取风险排序第5位。',
      },
      prediction,
      backtests: { backtest20, backtest50, backtest100, backtest200 },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      independence: '不读取 Gap、Guarded、Markov2 或 h47 的预测结果。',
      generatedAt: new Date().toISOString(),
    };
  }

  buildWalkForwardTimelineFromRows(rawRows: any[]) {
    const history = this.normalizeRows(rawRows);
    if (history.length < 300) return { rows: [], next: null };
    const matrix = history.map((row) => row.numbers);
    const features = this.buildFeatures(matrix);
    const rows = [];
    for (let t = 300; t < history.length; t++) {
      rows.push({
        year: history[t].year,
        No: history[t].No,
        number: this.pick(matrix, features, t).number,
      });
    }
    return {
      rows,
      next: this.pick(matrix, features, matrix.length).number,
    };
  }

  private pick(history: number[][], features: State[][], t: number) {
    const maps = {
      exact: new Map() as Counts, missFreq: new Map() as Counts, phase: new Map() as Counts,
      miss: new Map() as Counts, freq: new Map() as Counts, number: new Map() as Counts,
    };
    const start = Math.max(40, t - this.learningWindow);
    for (let s = start; s < t; s++) {
      const actual = new Set(history[s]);
      for (let n = 1; n <= 49; n++) {
        const state = features[s][n];
        const hit = actual.has(n) ? 1 : 0;
        this.add(maps.exact, `${state.miss}|${state.f5}|${state.f20}|${state.phase}|${state.trend}`, hit);
        this.add(maps.missFreq, `${state.miss}|${state.f20}`, hit);
        this.add(maps.phase, `${state.phase}|${state.trend}`, hit);
        this.add(maps.miss, state.miss, hit);
        this.add(maps.freq, `${state.f5}|${state.f20}`, hit);
        this.add(maps.number, n, hit);
      }
    }

    const ranking = Array.from({ length: 49 }, (_, index) => {
      const number = index + 1;
      const state = features[t][number];
      const risk =
        this.rate(maps.exact, `${state.miss}|${state.f5}|${state.f20}|${state.phase}|${state.trend}`, 28) * 0.28 +
        this.rate(maps.missFreq, `${state.miss}|${state.f20}`, 22) * 0.24 +
        this.rate(maps.phase, `${state.phase}|${state.trend}`, 22) * 0.16 +
        this.rate(maps.miss, state.miss, 18) * 0.12 +
        this.rate(maps.freq, `${state.f5}|${state.f20}`, 18) * 0.16 +
        this.rate(maps.number, number, 35) * 0.04;
      return { number, display: String(number).padStart(2, '0'), risk, state };
    }).sort((a, b) => a.risk - b.risk || a.number - b.number)
      .map((item, index) => ({ ...item, rank: index + 1, risk: Number(item.risk.toFixed(6)), riskPercent: Number((item.risk * 100).toFixed(2)) }));

    const selected = ranking[this.selectedRank - 1];
    return {
      ...selected,
      selectedRank: this.selectedRank,
      reason: `固定取条件风险第${this.selectedRank}位。遗漏${selected.state.raw.miss}期，近5期${selected.state.raw.f5}次，近20期${selected.state.raw.f20}次，间隔相位${selected.state.raw.phase.toFixed(2)}。`,
      topCandidates: ranking.slice(0, 8),
    };
  }

  private backtest(rows: DrawRow[], history: number[][], features: State[][], count: number) {
    const start = Math.max(300, history.length - count);
    const results = [];
    for (let t = start; t < history.length; t++) {
      const prediction = this.pick(history, features, t);
      results.push({
        year: rows[t].year, No: rows[t].No, actualNumbers: rows[t].numbers,
        predictedNumber: prediction.number, predictedDisplay: prediction.display,
        riskPercent: prediction.riskPercent, selectedRank: prediction.selectedRank,
        state: prediction.state, success: !history[t].includes(prediction.number),
      });
    }
    return summarizeKillBacktest(results);
  }

  private buildFeatures(history: number[][]) {
    const apps = Array.from({ length: 50 }, () => [] as number[]);
    const matrix: State[][] = Array.from({ length: history.length + 1 }, () => Array(50));
    for (let t = 0; t <= history.length; t++) {
      for (let n = 1; n <= 49; n++) {
        const appearances = apps[n];
        const last = appearances.length ? appearances[appearances.length - 1] : -1;
        const previous = appearances.length > 1 ? appearances[appearances.length - 2] : -1;
        const miss = last < 0 ? t : t - 1 - last;
        const lastGap = previous < 0 ? 7 : last - previous;
        let f5 = 0, f20 = 0, f50 = 0;
        for (let i = appearances.length - 1; i >= 0; i--) {
          const distance = t - appearances[i];
          if (distance <= 5) f5++;
          if (distance <= 20) f20++;
          if (distance <= 50) f50++;
          if (distance > 50) break;
        }
        const phase = (miss + 1) / Math.max(1, lastGap);
        const trendValue = f5 * 4 - f20;
        matrix[t][n] = {
          miss: this.missBin(miss), f5: Math.min(2, f5), f20: Math.min(4, f20),
          phase: phase < 0.5 ? 0 : phase < 0.8 ? 1 : phase < 1.15 ? 2 : phase < 1.65 ? 3 : phase < 2.4 ? 4 : 5,
          trend: trendValue <= -2 ? 0 : trendValue <= 1 ? 1 : 2,
          raw: { miss, f5, f20, f50, phase, lastGap },
        };
      }
      if (t < history.length) for (const n of history[t]) apps[n].push(t);
    }
    return matrix;
  }

  private missBin(value: number) {
    return value <= 0 ? 0 : value === 1 ? 1 : value === 2 ? 2 : value === 3 ? 3 : value <= 5 ? 4 : value <= 8 ? 5 : value <= 12 ? 6 : value <= 17 ? 7 : value <= 24 ? 8 : 9;
  }
  private add(map: Counts, key: string | number, hit: number) {
    const value = map.get(key) || [0, 0]; value[0] += hit; value[1]++; map.set(key, value);
  }
  private rate(map: Counts, key: string | number, prior: number) {
    const [hits, samples] = map.get(key) || [0, 0];
    return (hits + prior / 7) / (samples + prior);
  }
  private normalizeRows(rows: any[]): DrawRow[] {
    return rows.map((row) => ({
      id: Number(row.id || 0), year: row.year, No: row.No,
      numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    })).filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || (a.id || 0) - (b.id || 0));
  }
}

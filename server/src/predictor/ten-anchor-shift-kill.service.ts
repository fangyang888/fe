import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { summarizeKillBacktest } from './kill-backtest-summary';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

@Injectable()
export class TenAnchorShiftKillService {
  private readonly lag = 10;
  private readonly anchorPosition = 7;
  private readonly shift = -10;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 510) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '十期锚点位移模型至少需要510期历史，才能展示完整500期回测。',
      };
    }

    const prediction = this.pick(history, history.length);
    const backtest20 = this.backtest(history, 20);
    const backtest50 = this.backtest(history, 50);
    const backtest100 = this.backtest(history, 100);
    const backtest200 = this.backtest(history, 200);
    const backtest500 = this.backtest(history, 500);

    return {
      status: [backtest20, backtest50, backtest100, backtest200]
        .every((item) => item.successRate > 0.9) ? 'stable' : 'watch',
      strategy: {
        key: 'tenAnchorPosition7ShiftMinus10',
        name: '十期锚点位移',
        lag: this.lag,
        anchorPosition: this.anchorPosition,
        shift: this.shift,
        description: '固定取10期前第7个号码，在1～49范围内循环减10，作为本期单杀号码。参数永久固定，不根据近期成绩切换。',
      },
      prediction,
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const sourceIndex = t - this.lag;
    const source = history[sourceIndex];
    const anchorNumber = source.numbers[this.anchorPosition - 1];
    const number = this.wrap(anchorNumber + this.shift);
    return {
      number,
      display: String(number).padStart(2, '0'),
      anchorNumber,
      anchorDisplay: String(anchorNumber).padStart(2, '0'),
      sourceIndex,
      source: {
        id: source.id,
        year: source.year,
        No: source.No,
        numbers: source.numbers,
      },
      formula: `${String(anchorNumber).padStart(2, '0')} - 10 → ${String(number).padStart(2, '0')}`,
      reason: `取10期前${source.year || ''}年第${source.No || '--'}期第7位 ${String(anchorNumber).padStart(2, '0')}，循环减10得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private backtest(history: DrawRow[], count: number) {
    const start = Math.max(this.lag, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const prediction = this.pick(history, t);
      const actual = history[t];
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        anchorNumber: prediction.anchorNumber,
        anchorDisplay: prediction.anchorDisplay,
        anchorYear: prediction.source.year,
        anchorNo: prediction.source.No,
        formula: prediction.formula,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return summarizeKillBacktest(rows);
  }

  private wrap(value: number) {
    return ((value - 1) % 49 + 49) % 49 + 1;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows.map((row) => ({
      id: Number(row.id || 0),
      year: row.year,
      No: row.No,
      numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    })).filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || a.id - b.id);
  }
}

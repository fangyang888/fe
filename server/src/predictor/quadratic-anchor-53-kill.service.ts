import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };

@Injectable()
export class QuadraticAnchor53KillService {
  private readonly lag = 53;
  private readonly anchorPosition = 2;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 553) {
      return { status: 'insufficient-history', historyCount: history.length, message: '53期二次锚点至少需要553期历史，才能展示完整500期回测。' };
    }
    const prediction = this.pick(history, history.length);
    const backtest20 = this.backtest(history, 20);
    const backtest50 = this.backtest(history, 50);
    const backtest100 = this.backtest(history, 100);
    const backtest200 = this.backtest(history, 200);
    const backtest500 = this.backtest(history, 500);
    return {
      status: [backtest20, backtest50, backtest100, backtest200].every((item) => item.successRate >= 0.95) ? 'stable' : 'watch',
      strategy: {
        key: 'quadraticAnchor53Position2', name: '53期二次锚点', lag: this.lag,
        anchorPosition: this.anchorPosition, formula: '2x² + 3x − 7',
        description: '固定取53期前第2位x，计算2x²+3x−7，再在1～49范围循环回绕。参数永久固定。',
      },
      prediction,
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const source = history[t - this.lag];
    const anchorNumber = source.numbers[this.anchorPosition - 1];
    const rawValue = 2 * anchorNumber * anchorNumber + 3 * anchorNumber - 7;
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number, display: String(number).padStart(2, '0'), anchorNumber,
      anchorDisplay: String(anchorNumber).padStart(2, '0'), rawValue, cycles,
      source: { id: source.id, year: source.year, No: source.No, numbers: source.numbers },
      formula: `2 × ${anchorNumber}² + 3 × ${anchorNumber} − 7 = ${rawValue} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × ${cycles} = ${number}`,
      reason: `取53期前${source.year || ''}年第${source.No || '--'}期第2位 ${String(anchorNumber).padStart(2, '0')}，二次公式得到${rawValue}，循环回绕后为 ${String(number).padStart(2, '0')}。`,
    };
  }

  private backtest(history: DrawRow[], count: number) {
    const start = Math.max(this.lag, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const prediction = this.pick(history, t);
      const actual = history[t];
      rows.push({
        year: actual.year, No: actual.No, actualNumbers: actual.numbers,
        predictedNumber: prediction.number, predictedDisplay: prediction.display,
        anchorNumber: prediction.anchorNumber, anchorDisplay: prediction.anchorDisplay,
        anchorYear: prediction.source.year, anchorNo: prediction.source.No,
        rawValue: prediction.rawValue, formula: prediction.formula,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward', count: rows.length, successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      rows: rows.slice().reverse(), failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private wrap(value: number) { return ((value - 1) % 49 + 49) % 49 + 1; }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows.map((row) => ({
      id: Number(row.id || 0), year: row.year, No: row.No,
      numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    })).filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || a.id - b.id);
  }
}

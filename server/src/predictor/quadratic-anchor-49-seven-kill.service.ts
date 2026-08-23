import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };

@Injectable()
export class QuadraticAnchor49SevenKillService {
  private readonly lag = 49;
  private readonly anchorPosition = 7;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 181;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 549) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '49期七码二次锚点至少需要549期历史，才能展示完整500期回测。',
      };
    }

    const prediction = this.pick(history, history.length);
    const backtest20 = this.backtest(history, 20);
    const backtest50 = this.backtest(history, 50);
    const backtest100 = this.backtest(history, 100);
    const backtest200 = this.backtest(history, 200);
    const backtest500 = this.backtest(history, 500);
    const validationRows = this.buildRows(history).filter(
      (row) => Number(row.year) > this.validationYear ||
        (Number(row.year) === this.validationYear && Number(row.No) >= this.validationStartNo),
    );
    const validation = this.summarize(validationRows);

    return {
      status: [backtest20, backtest50, backtest100, backtest200]
        .every((item) => item.successRate >= 0.95) ? 'stable' : 'watch',
      strategy: {
        key: 'quadraticAnchor49Position7',
        name: '49期七码二次锚点',
        lag: this.lag,
        anchorPosition: this.anchorPosition,
        formula: '−4x² + x + 20',
        description: '固定读取49期前第7位x，计算−4x²+x+20，再在1～49范围循环回绕。参数以2026年第180期为止的数据封存。',
      },
      prediction,
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      validation: {
        ...validation,
        kind: 'out-of-sample',
        start: { year: this.validationYear, No: this.validationStartNo },
      },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const source = history[t - this.lag];
    const anchorNumber = source.numbers[this.anchorPosition - 1];
    const rawValue = -4 * anchorNumber * anchorNumber + anchorNumber + 20;
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number, display: String(number).padStart(2, '0'), anchorNumber,
      anchorDisplay: String(anchorNumber).padStart(2, '0'), rawValue, cycles,
      source: { id: source.id, year: source.year, No: source.No, numbers: source.numbers },
      formula: `−4 × ${anchorNumber}² + ${anchorNumber} + 20 = ${rawValue} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × ${cycles} = ${number}`,
      reason: `取49期前${source.year || ''}年第${source.No || '--'}期第7位 ${String(anchorNumber).padStart(2, '0')}，二次公式得到${rawValue}，循环回绕后为 ${String(number).padStart(2, '0')}。`,
    };
  }

  private buildRows(history: DrawRow[]) {
    const rows = [];
    for (let t = this.lag; t < history.length; t++) {
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
    return rows;
  }

  private backtest(history: DrawRow[], count: number) {
    return this.summarize(this.buildRows(history).slice(-count));
  }

  private summarize(rows: any[]) {
    const successCount = rows.filter((row) => row.success).length;
    const specialCodeMissCount = rows.filter(
      (row) => row.predictedNumber !== row.actualNumbers[row.actualNumbers.length - 1],
    ).length;
    return {
      kind: 'walk-forward', count: rows.length, successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      specialCodeMissCount,
      specialCodeHitCount: rows.length - specialCodeMissCount,
      specialCodeMissRate: rows.length ? specialCodeMissCount / rows.length : 0,
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

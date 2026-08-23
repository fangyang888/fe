import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };

@Injectable()
export class LinearAnchor63FirstKillService {
  private readonly lag = 63;
  private readonly anchorPosition = 1;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 563) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '63期首位线性锚点至少需要563期历史，才能展示完整500期回测。',
      };
    }

    const rows = this.buildRows(history);
    const summarizeRecent = (count: number) => this.summarize(rows.slice(-count));
    const backtest20 = summarizeRecent(20);
    const backtest50 = summarizeRecent(50);
    const backtest100 = summarizeRecent(100);
    const backtest200 = summarizeRecent(200);
    const backtest500 = summarizeRecent(500);
    const validationRows = rows.filter(
      (row) =>
        Number(row.year) > this.validationYear ||
        (Number(row.year) === this.validationYear && Number(row.No) >= this.validationStartNo),
    );

    return {
      status: [backtest20, backtest50, backtest100, backtest200]
        .every((item) => item.successRate >= 0.95) ? 'stable' : 'watch',
      strategy: {
        key: 'linearAnchor63Position1',
        name: '63期首位线性锚点',
        lag: this.lag,
        anchorPosition: this.anchorPosition,
        formula: '3x + 38',
        frozenAt: { year: 2026, No: 198 },
        description: '固定读取63期前第1位x，计算3x+38，再在1～49范围循环回绕。策略从2026年第199期起冻结观察。',
      },
      prediction: this.pick(history, history.length),
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      validation: {
        ...this.summarize(validationRows),
        kind: 'prospective',
        start: { year: this.validationYear, No: this.validationStartNo },
      },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const source = history[t - this.lag];
    const anchorNumber = source.numbers[this.anchorPosition - 1];
    const rawValue = 3 * anchorNumber + 38;
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number,
      display: String(number).padStart(2, '0'),
      anchorNumber,
      anchorDisplay: String(anchorNumber).padStart(2, '0'),
      rawValue,
      cycles,
      source: { id: source.id, year: source.year, No: source.No, numbers: source.numbers },
      formula: `3 × ${anchorNumber} + 38 = ${rawValue} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × ${cycles} = ${number}`,
      reason: `取63期前${source.year || ''}年第${source.No || '--'}期第1位 ${String(anchorNumber).padStart(2, '0')}，线性公式得到${rawValue}，循环回绕后为 ${String(number).padStart(2, '0')}。`,
    };
  }

  private buildRows(history: DrawRow[]) {
    const rows = [];
    for (let t = this.lag; t < history.length; t++) {
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
        rawValue: prediction.rawValue,
        formula: prediction.formula,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return rows;
  }

  private summarize(rows: any[]) {
    const successCount = rows.filter((row) => row.success).length;
    const specialCodeMissCount = rows.filter(
      (row) => row.predictedNumber !== row.actualNumbers[row.actualNumbers.length - 1],
    ).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      specialCodeMissCount,
      specialCodeHitCount: rows.length - specialCodeMissCount,
      specialCodeMissRate: rows.length ? specialCodeMissCount / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private wrap(value: number) {
    return ((value - 1) % 49 + 49) % 49 + 1;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: row.year,
        No: row.No,
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
      }))
      .filter(
        (row) =>
          row.numbers.length === 7 &&
          row.numbers.every((number) => number >= 1 && number <= 49),
      )
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          a.id - b.id,
      );
  }
}

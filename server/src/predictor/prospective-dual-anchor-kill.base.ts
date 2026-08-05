import { HistoryService } from '../history/history.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };

type AnchorConfig = {
  lag: number;
  position: number;
  label: string;
};

export type ProspectiveDualAnchorConfig = {
  key: string;
  name: string;
  formula: string;
  description: string;
  first: AnchorConfig;
  second: AnchorConfig;
  calculate: (first: number, second: number) => number;
  formatCalculation: (
    first: number,
    second: number,
    rawValue: number,
  ) => string;
};

export class ProspectiveDualAnchorKillBase {
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;

  constructor(
    private readonly historyService: HistoryService,
    private readonly config: ProspectiveDualAnchorConfig,
  ) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const maxLag = Math.max(this.config.first.lag, this.config.second.lag);
    const minimumHistory = maxLag + 500;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `${this.config.name}至少需要${minimumHistory}期历史，才能展示完整500期回测。`,
      };
    }

    const rows = this.buildRows(history, maxLag);
    const summarizeRecent = (count: number) =>
      this.summarize(rows.slice(-count));
    const backtest20 = summarizeRecent(20);
    const backtest50 = summarizeRecent(50);
    const backtest100 = summarizeRecent(100);
    const backtest200 = summarizeRecent(200);
    const backtest500 = summarizeRecent(500);
    const validationRows = rows.filter(
      (row) =>
        Number(row.year) > this.validationYear ||
        (Number(row.year) === this.validationYear &&
          Number(row.No) >= this.validationStartNo),
    );

    return {
      status: [backtest20, backtest50, backtest100, backtest200].every(
        (item) => item.successRate >= 0.95,
      )
        ? 'stable'
        : 'watch',
      strategy: {
        key: this.config.key,
        name: this.config.name,
        formula: this.config.formula,
        firstAnchor: this.config.first,
        secondAnchor: this.config.second,
        frozenAt: { year: 2026, No: 198 },
        description: this.config.description,
      },
      prediction: this.pick(history, history.length),
      backtests: {
        backtest20,
        backtest50,
        backtest100,
        backtest200,
        backtest500,
      },
      validation: {
        ...this.summarize(validationRows),
        kind: 'prospective',
        start: { year: this.validationYear, No: this.validationStartNo },
      },
      historyMeta: {
        count: history.length,
        latest: history[history.length - 1],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const firstSource = history[t - this.config.first.lag];
    const secondSource = history[t - this.config.second.lag];
    const firstNumber = firstSource.numbers[this.config.first.position - 1];
    const secondNumber = secondSource.numbers[this.config.second.position - 1];
    const rawValue = this.config.calculate(firstNumber, secondNumber);
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number,
      display: String(number).padStart(2, '0'),
      firstNumber,
      firstDisplay: String(firstNumber).padStart(2, '0'),
      secondNumber,
      secondDisplay: String(secondNumber).padStart(2, '0'),
      rawValue,
      cycles,
      firstSource: {
        id: firstSource.id,
        year: firstSource.year,
        No: firstSource.No,
        numbers: firstSource.numbers,
      },
      secondSource: {
        id: secondSource.id,
        year: secondSource.year,
        No: secondSource.No,
        numbers: secondSource.numbers,
      },
      formula: `${this.config.formatCalculation(firstNumber, secondNumber, rawValue)} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × ${cycles} = ${number}`,
      reason:
        `取${this.config.first.label} ${String(firstNumber).padStart(2, '0')} 与` +
        `${this.config.second.label} ${String(secondNumber).padStart(2, '0')}，按固定公式计算并回绕得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private buildRows(history: DrawRow[], maxLag: number) {
    const rows = [];
    for (let t = maxLag; t < history.length; t++) {
      const prediction = this.pick(history, t);
      const actual = history[t];
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        firstNumber: prediction.firstNumber,
        firstDisplay: prediction.firstDisplay,
        secondNumber: prediction.secondNumber,
        secondDisplay: prediction.secondDisplay,
        firstYear: prediction.firstSource.year,
        firstNo: prediction.firstSource.No,
        secondYear: prediction.secondSource.year,
        secondNo: prediction.secondSource.No,
        rawValue: prediction.rawValue,
        formula: prediction.formula,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return rows;
  }

  private summarize(rows: any[]) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private wrap(value: number) {
    return ((((value - 1) % 49) + 49) % 49) + 1;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: row.year,
        No: row.No,
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(
          Number,
        ),
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

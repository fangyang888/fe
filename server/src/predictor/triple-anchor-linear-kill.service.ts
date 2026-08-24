import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

@Injectable()
export class TripleAnchorLinearKillService {
  private readonly firstLag = 53;
  private readonly firstPosition = 4;
  private readonly secondLag = 52;
  private readonly secondPosition = 2;
  private readonly thirdLag = 95;
  private readonly thirdPosition = 6;
  private readonly observationYear = 2026;
  private readonly historicalStartNo = 199;
  private readonly historicalEndNo = 224;
  private readonly prospectiveStartNo = 225;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const maxLag = Math.max(this.firstLag, this.secondLag, this.thirdLag);
    const minimumHistory = maxLag + 500;

    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `三锚点线性回绕至少需要${minimumHistory}期历史，才能展示完整500期回测。`,
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
    const historicalValidationRows = rows.filter(
      (row) =>
        Number(row.year) === this.observationYear &&
        Number(row.No) >= this.historicalStartNo &&
        Number(row.No) <= this.historicalEndNo,
    );
    const prospectiveRows = rows.filter(
      (row) =>
        Number(row.year) > this.observationYear ||
        (Number(row.year) === this.observationYear &&
          Number(row.No) >= this.prospectiveStartNo),
    );

    return {
      status: [backtest20, backtest50, backtest100, backtest200].every(
        (item) => item.successRate >= 0.95,
      )
        ? 'stable'
        : 'watch',
      strategy: {
        key: 'tripleAnchorLinear53_52_95',
        name: '三锚点线性回绕',
        formula: '−3x − 6y − 4z + 17',
        firstAnchor: {
          lag: this.firstLag,
          position: this.firstPosition,
          label: '53期前第4位',
        },
        secondAnchor: {
          lag: this.secondLag,
          position: this.secondPosition,
          label: '52期前第2位',
        },
        thirdAnchor: {
          lag: this.thirdLag,
          position: this.thirdPosition,
          label: '95期前第6位',
        },
        frozenAt: { year: this.observationYear, No: this.historicalEndNo },
        prospectiveStart: {
          year: this.observationYear,
          No: this.prospectiveStartNo,
        },
        description:
          '固定读取53期前第4位x、52期前第2位y和95期前第6位z，计算−3x−6y−4z+17，再在1～49范围循环回绕。199～224期作为历史留出回放，225期起记录真实前瞻结果。',
      },
      prediction: this.pick(history, history.length),
      backtests: {
        backtest20,
        backtest50,
        backtest100,
        backtest200,
        backtest500,
      },
      historicalValidation: {
        ...this.summarize(historicalValidationRows),
        kind: 'historical-holdout-replay',
        start: { year: this.observationYear, No: this.historicalStartNo },
        end: { year: this.observationYear, No: this.historicalEndNo },
      },
      validation: {
        ...this.summarize(prospectiveRows),
        kind: 'prospective-frozen',
        start: { year: this.observationYear, No: this.prospectiveStartNo },
        message: prospectiveRows.length
          ? `已累计${prospectiveRows.length}期真实前瞻结果。`
          : '等待2026年第225期及以后开奖结果。',
      },
      historyMeta: {
        count: history.length,
        latest: history[history.length - 1],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const firstSource = history[t - this.firstLag];
    const secondSource = history[t - this.secondLag];
    const thirdSource = history[t - this.thirdLag];
    const firstNumber = firstSource.numbers[this.firstPosition - 1];
    const secondNumber = secondSource.numbers[this.secondPosition - 1];
    const thirdNumber = thirdSource.numbers[this.thirdPosition - 1];
    const rawValue =
      -3 * firstNumber - 6 * secondNumber - 4 * thirdNumber + 17;
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);

    return {
      number,
      display: String(number).padStart(2, '0'),
      firstNumber,
      firstDisplay: String(firstNumber).padStart(2, '0'),
      secondNumber,
      secondDisplay: String(secondNumber).padStart(2, '0'),
      thirdNumber,
      thirdDisplay: String(thirdNumber).padStart(2, '0'),
      rawValue,
      cycles,
      firstSource: this.publicSource(firstSource),
      secondSource: this.publicSource(secondSource),
      thirdSource: this.publicSource(thirdSource),
      formula:
        `−3 × ${firstNumber} − 6 × ${secondNumber} − 4 × ${thirdNumber} + 17` +
        ` = ${rawValue} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × (${cycles}) = ${number}`,
      reason:
        `取53期前第4位 ${String(firstNumber).padStart(2, '0')}、` +
        `52期前第2位 ${String(secondNumber).padStart(2, '0')} 与` +
        `95期前第6位 ${String(thirdNumber).padStart(2, '0')}，` +
        `按固定公式计算并回绕得到 ${String(number).padStart(2, '0')}。`,
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
        thirdNumber: prediction.thirdNumber,
        thirdDisplay: prediction.thirdDisplay,
        firstYear: prediction.firstSource.year,
        firstNo: prediction.firstSource.No,
        secondYear: prediction.secondSource.year,
        secondNo: prediction.secondSource.No,
        thirdYear: prediction.thirdSource.year,
        thirdNo: prediction.thirdSource.No,
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

  private publicSource(source: DrawRow) {
    return {
      id: source.id,
      year: source.year,
      No: source.No,
      numbers: source.numbers,
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

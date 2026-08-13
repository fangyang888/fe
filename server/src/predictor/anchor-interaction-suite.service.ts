import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

type AnchorDefinition = {
  symbol: string;
  lag: number;
  position: number;
  label: string;
};

type ModelDefinition = {
  key: string;
  name: string;
  formula: string;
  description: string;
  anchors: AnchorDefinition[];
  calculate: (values: number[]) => number;
  formatCalculation: (values: number[], rawValue: number) => string;
};

@Injectable()
export class AnchorInteractionSuiteService {
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const definitions = this.modelDefinitions();
    const largestLag = Math.max(
      ...definitions.flatMap((definition) =>
        definition.anchors.map((anchor) => anchor.lag),
      ),
    );
    const minimumHistory = largestLag + 500;

    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `四公式统计至少需要${minimumHistory}期历史，才能为每个模块展示完整500期回测。`,
      };
    }

    const models = definitions.map((definition) =>
      this.buildModel(history, definition),
    );

    return {
      status: models.every((model) => model.status === 'stable')
        ? 'stable'
        : 'watch',
      strategy: {
        key: 'anchorInteractionSuite',
        name: '锚点交互四公式统计',
        modelCount: models.length,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: {
          year: this.validationYear,
          No: this.validationStartNo,
        },
        description:
          '一个页面独立统计双锚点平方、四锚点差分、四锚点XOR和三锚点乘积四种固定映射；各模块互不择优、不动态切换。',
      },
      models,
      historyMeta: {
        count: history.length,
        latest: history[history.length - 1],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildModel(history: DrawRow[], definition: ModelDefinition) {
    const maxLag = Math.max(
      ...definition.anchors.map((anchor) => anchor.lag),
    );
    const rows = this.buildRows(history, definition, maxLag);
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
    const stable = [backtest20, backtest50, backtest100, backtest200].every(
      (item) => item.successRate >= 0.95,
    );

    return {
      key: definition.key,
      name: definition.name,
      formula: definition.formula,
      description: definition.description,
      anchors: definition.anchors,
      status: stable ? 'stable' : 'watch',
      prediction: this.pick(history, history.length, definition),
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
    };
  }

  private pick(
    history: DrawRow[],
    t: number,
    definition: ModelDefinition,
  ) {
    const anchors = definition.anchors.map((anchor) => {
      const source = history[t - anchor.lag];
      const number = source.numbers[anchor.position - 1];
      return {
        ...anchor,
        number,
        display: String(number).padStart(2, '0'),
        source: this.publicSource(source),
      };
    });
    const values = anchors.map((anchor) => anchor.number);
    const rawValue = definition.calculate(values);
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);

    return {
      number,
      display: String(number).padStart(2, '0'),
      rawValue,
      cycles,
      anchors,
      formula: `${definition.formatCalculation(values, rawValue)} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × (${cycles}) = ${number}`,
      reason:
        anchors
          .map((anchor) => `${anchor.label} ${anchor.display}`)
          .join('、') +
        `，按固定${definition.name}公式计算并回绕得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private buildRows(
    history: DrawRow[],
    definition: ModelDefinition,
    maxLag: number,
  ) {
    const rows = [];
    for (let t = maxLag; t < history.length; t++) {
      const prediction = this.pick(history, t, definition);
      const actual = history[t];
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        rawValue: prediction.rawValue,
        anchors: prediction.anchors.map((anchor) => ({
          symbol: anchor.symbol,
          label: anchor.label,
          number: anchor.number,
          display: anchor.display,
          year: anchor.source.year,
          No: anchor.source.No,
        })),
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

  private modelDefinitions(): ModelDefinition[] {
    return [
      {
        key: 'dualAnchorSquareSum',
        name: '双锚点平方叠加',
        formula: '4x² + 2y² + 1',
        description:
          '读取17期前第3位x和52期前第1位y，将两个平方项按固定权重叠加后回绕。',
        anchors: [
          { symbol: 'x', lag: 17, position: 3, label: '17期前第3位' },
          { symbol: 'y', lag: 52, position: 1, label: '52期前第1位' },
        ],
        calculate: ([x, y]) => 4 * x * x + 2 * y * y + 1,
        formatCalculation: ([x, y], rawValue) =>
          `4 × ${x}² + 2 × ${y}² + 1 = ${rawValue}`,
      },
      {
        key: 'fourAnchorDifferenceInteraction',
        name: '四锚点差分交互',
        formula: '4(a−b)(c−d) + (a+c) + (b+d) + 32',
        description:
          '读取四个长短期锚点，以两组差值的乘积表示交互，再叠加两组和值并回绕。',
        anchors: [
          { symbol: 'a', lag: 126, position: 6, label: '126期前第6位' },
          { symbol: 'b', lag: 137, position: 6, label: '137期前第6位' },
          { symbol: 'c', lag: 28, position: 4, label: '28期前第4位' },
          { symbol: 'd', lag: 23, position: 3, label: '23期前第3位' },
        ],
        calculate: ([a, b, c, d]) =>
          4 * (a - b) * (c - d) + (a + c) + (b + d) + 32,
        formatCalculation: ([a, b, c, d], rawValue) =>
          `4 × (${a} − ${b}) × (${c} − ${d}) + (${a} + ${c}) + (${b} + ${d}) + 32 = ${rawValue}`,
      },
      {
        key: 'fourAnchorBitwiseXor',
        name: '四锚点 XOR 映射',
        formula: '(7a XOR 6b XOR 5c XOR 6d) + 17',
        description:
          '将四个锚点乘以固定权重后执行整数按位异或，再加17并回绕至1～49。',
        anchors: [
          { symbol: 'a', lag: 67, position: 3, label: '67期前第3位' },
          { symbol: 'b', lag: 70, position: 6, label: '70期前第6位' },
          { symbol: 'c', lag: 105, position: 2, label: '105期前第2位' },
          { symbol: 'd', lag: 36, position: 2, label: '36期前第2位' },
        ],
        calculate: ([a, b, c, d]) =>
          ((7 * a) ^ (6 * b) ^ (5 * c) ^ (6 * d)) + 17,
        formatCalculation: ([a, b, c, d], rawValue) =>
          `((7 × ${a}) XOR (6 × ${b}) XOR (5 × ${c}) XOR (6 × ${d})) + 17 = ${rawValue}`,
      },
      {
        key: 'tripleAnchorProductInteraction',
        name: '三锚点乘积交互',
        formula: '−4xy − yz − 5zx + 30',
        description:
          '读取三个不同时间尺度的锚点，以三组两两乘积构成交互项，再循环回绕。',
        anchors: [
          { symbol: 'x', lag: 27, position: 1, label: '27期前第1位' },
          { symbol: 'y', lag: 110, position: 5, label: '110期前第5位' },
          { symbol: 'z', lag: 57, position: 6, label: '57期前第6位' },
        ],
        calculate: ([x, y, z]) => -4 * x * y - y * z - 5 * z * x + 30,
        formatCalculation: ([x, y, z], rawValue) =>
          `−4 × ${x} × ${y} − ${y} × ${z} − 5 × ${z} × ${x} + 30 = ${rawValue}`,
      },
    ];
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

import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

type AnchorDefinition = {
  lag: number;
  position: number;
  label: string;
};

type GateDefinition =
  | {
      kind: 'anchor';
      lag: number;
      position: number;
      modulus: number;
      label: string;
    }
  | {
      kind: 'previous-period';
      modulus: number;
      label: string;
    };

type ModelDefinition = {
  key: string;
  code: 'A' | 'B' | 'C' | 'D' | 'E';
  name: string;
  formula: string;
  description: string;
  primary: AnchorDefinition;
  gate: GateDefinition;
  multiplier: number;
  offsets: number[];
};

@Injectable()
export class GatedAnchorSuiteService {
  private readonly frozenYear = 2026;
  private readonly frozenAtNo = 198;
  private readonly prospectiveStartNo = 199;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const definitions = this.modelDefinitions();
    const largestLag = Math.max(
      ...definitions.flatMap((definition) => [
        definition.primary.lag,
        definition.gate.kind === 'anchor' ? definition.gate.lag : 1,
      ]),
    );
    const minimumHistory = largestLag + 200;

    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `门控锚点五公式至少需要${minimumHistory}期历史，才能展示完整200期研究统计。`,
      };
    }

    const models = definitions.map((definition) =>
      this.buildModel(history, definition),
    );
    const latest = history[history.length - 1];

    return {
      status: 'frozen',
      strategy: {
        key: 'gatedAnchorSuiteABCDE',
        name: '门控锚点 A～E 五公式',
        modelCount: models.length,
        researchWindow: 200,
        frozenAt: { year: this.frozenYear, No: this.frozenAtNo },
        prospectiveStart: {
          year: this.frozenYear,
          No: this.prospectiveStartNo,
        },
        description:
          'A～E 五个门控映射以2026年第198期为研究截止点固定，第199期起同时独立记录真实前瞻结果，不根据成绩切换或调整公式。',
      },
      target: {
        year: latest.year,
        No: Number(latest.No || 0) + 1,
      },
      models,
      historyMeta: {
        count: history.length,
        latest,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildModel(history: DrawRow[], definition: ModelDefinition) {
    const maxLag = Math.max(
      definition.primary.lag,
      definition.gate.kind === 'anchor' ? definition.gate.lag : 1,
    );
    const rows = this.buildRows(history, definition, maxLag);
    const recent200 = rows.slice(-200);
    const prospectiveRows = rows.filter(
      (row) =>
        Number(row.year) > this.frozenYear ||
        (Number(row.year) === this.frozenYear &&
          Number(row.No) >= this.prospectiveStartNo),
    );

    return {
      key: definition.key,
      code: definition.code,
      name: definition.name,
      formula: definition.formula,
      description: definition.description,
      status: 'frozen',
      primary: definition.primary,
      gate: definition.gate,
      offsets: definition.offsets,
      prediction: this.pick(history, history.length, definition),
      backtests: {
        backtest20: this.summarize(rows.slice(-20), true),
        backtest50: this.summarize(rows.slice(-50)),
        backtest100: this.summarize(rows.slice(-100)),
        backtest200: this.summarize(recent200),
      },
      segments: [0, 1, 2, 3].map((index) => {
        const segmentRows = recent200.slice(index * 50, (index + 1) * 50);
        return {
          index: index + 1,
          label: `分段${index + 1}`,
          start: this.publicPeriod(segmentRows[0]),
          end: this.publicPeriod(segmentRows[segmentRows.length - 1]),
          ...this.summarize(segmentRows),
        };
      }),
      validation: {
        ...this.summarize(prospectiveRows),
        kind: 'prospective-frozen',
        start: { year: this.frozenYear, No: this.prospectiveStartNo },
        message: prospectiveRows.length
          ? `已累计${prospectiveRows.length}期真实前瞻结果。`
          : '等待2026年第199期及以后开奖结果。',
      },
    };
  }

  private pick(history: DrawRow[], t: number, definition: ModelDefinition) {
    const primarySource = history[t - definition.primary.lag];
    const x = primarySource.numbers[definition.primary.position - 1];
    const gateSource =
      definition.gate.kind === 'anchor'
        ? history[t - definition.gate.lag]
        : history[t - 1];
    const gateValue =
      definition.gate.kind === 'anchor'
        ? gateSource.numbers[definition.gate.position - 1]
        : Number(gateSource.No || 0);
    const remainder = this.mod(gateValue, definition.gate.modulus);
    const offset = definition.offsets[remainder];
    const rawValue = definition.multiplier * x + offset;
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);

    return {
      number,
      display: String(number).padStart(2, '0'),
      rawValue,
      cycles,
      x,
      xDisplay: String(x).padStart(2, '0'),
      primary: {
        ...definition.primary,
        number: x,
        display: String(x).padStart(2, '0'),
        source: this.publicSource(primarySource),
      },
      gate: {
        ...definition.gate,
        value: gateValue,
        remainder,
        offset,
        source: this.publicSource(gateSource),
      },
      formula:
        `${definition.multiplier} × ${x} + ${offset} = ${rawValue}` +
        ` → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × (${cycles}) = ${number}`,
      reason:
        `${definition.primary.label} x=${String(x).padStart(2, '0')}，` +
        `${definition.gate.label}=${gateValue}，余数${remainder}选用偏移${offset}，` +
        `固定映射回绕得到 ${String(number).padStart(2, '0')}。`,
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
        primary: {
          number: prediction.primary.number,
          display: prediction.primary.display,
          year: prediction.primary.source.year,
          No: prediction.primary.source.No,
        },
        gate: {
          value: prediction.gate.value,
          remainder: prediction.gate.remainder,
          offset: prediction.gate.offset,
          year: prediction.gate.source.year,
          No: prediction.gate.source.No,
        },
        formula: prediction.formula,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return rows;
  }

  private summarize(rows: any[], includeRows = false) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      ...(includeRows ? { rows: rows.slice().reverse() } : {}),
    };
  }

  private modelDefinitions(): ModelDefinition[] {
    return [
      {
        key: 'historyMod3A',
        code: 'A',
        name: '历史锚点 Mod3 · A',
        formula: 'g mod 3：0→12x+30，1→12x+23，2→12x+20',
        description:
          '读取247期前第7位x，以33期前第2位g对3取余，选择三组固定偏移。',
        primary: { lag: 247, position: 7, label: '247期前第7位' },
        gate: {
          kind: 'anchor',
          lag: 33,
          position: 2,
          modulus: 3,
          label: '33期前第2位 g',
        },
        multiplier: 12,
        offsets: [30, 23, 20],
      },
      {
        key: 'historyMod3B',
        code: 'B',
        name: '历史锚点 Mod3 · B',
        formula: 'g mod 3：0→5x+25，1→5x+37，2→5x+48',
        description:
          '读取390期前第1位x，以205期前第1位g对3取余，选择三组固定偏移。',
        primary: { lag: 390, position: 1, label: '390期前第1位' },
        gate: {
          kind: 'anchor',
          lag: 205,
          position: 1,
          modulus: 3,
          label: '205期前第1位 g',
        },
        multiplier: 5,
        offsets: [25, 37, 48],
      },
      {
        key: 'historyParityC',
        code: 'C',
        name: '历史锚点奇偶 · C',
        formula: 'g为偶数→41x+38，g为奇数→41x+3',
        description:
          '读取33期前第7位x，以194期前第3位g的奇偶选择两组固定偏移。',
        primary: { lag: 33, position: 7, label: '33期前第7位' },
        gate: {
          kind: 'anchor',
          lag: 194,
          position: 3,
          modulus: 2,
          label: '194期前第3位 g',
        },
        multiplier: 41,
        offsets: [38, 3],
      },
      {
        key: 'periodMod3D',
        code: 'D',
        name: '期号 Mod3 · D',
        formula: 'q mod 3：0→18x+21，1→18x+41，2→18x+47',
        description:
          '读取365期前第1位x，以上一期开奖期号q对3取余，选择三组固定偏移。',
        primary: { lag: 365, position: 1, label: '365期前第1位' },
        gate: {
          kind: 'previous-period',
          modulus: 3,
          label: '上一期开奖期号 q',
        },
        multiplier: 18,
        offsets: [21, 41, 47],
      },
      {
        key: 'periodParityE',
        code: 'E',
        name: '期号奇偶 · E',
        formula: 'q为偶数→10x+25，q为奇数→10x+2',
        description:
          '读取329期前第1位x，以上一期开奖期号q的奇偶选择两组固定偏移。',
        primary: { lag: 329, position: 1, label: '329期前第1位' },
        gate: {
          kind: 'previous-period',
          modulus: 2,
          label: '上一期开奖期号 q',
        },
        multiplier: 10,
        offsets: [25, 2],
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

  private publicPeriod(row?: { year?: number; No?: number }) {
    return row ? { year: row.year, No: row.No } : null;
  }

  private mod(value: number, modulus: number) {
    return ((value % modulus) + modulus) % modulus;
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

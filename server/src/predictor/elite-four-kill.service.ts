import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year: number;
  No: number;
  numbers: number[];
};

type ModelDefinition = {
  key: string;
  code: 'F' | 'Q17' | 'DT' | 'L63';
  name: string;
  shortName: string;
  family: 'quadratic' | 'dual' | 'linear';
  formula: string;
  description: string;
  largestLag: number;
  originalFrozenAt: { year: number; No: number };
};

@Injectable()
export class EliteFourKillService {
  private readonly frozenYear = 2026;
  private readonly frozenAtNo = 198;
  private readonly prospectiveStartNo = 199;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const definitions = this.modelDefinitions();
    const largestLag = Math.max(...definitions.map((item) => item.largestLag));
    const frozenIndex = history.findIndex(
      (row) => row.year === this.frozenYear && row.No === this.frozenAtNo,
    );

    if (frozenIndex < largestLag + 500 - 1) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '四算法对照需要2026年第198期以及此前完整500期历史。',
      };
    }

    const latest = history[history.length - 1];
    const models = definitions.map((definition) =>
      this.buildModel(history, frozenIndex, definition),
    );

    return {
      status: 'frozen-comparison',
      strategy: {
        key: 'eliteFourKillComparison',
        name: '四算法实战对照',
        modelCount: models.length,
        frozenAt: { year: this.frozenYear, No: this.frozenAtNo },
        prospectiveStart: {
          year: this.frozenYear,
          No: this.prospectiveStartNo,
        },
        theoreticalBaseline: 42 / 49,
        description:
          '统一展示新F、17期首位二次、双时间尺度和63期首位线性；五段统计固定截止到2026年第198期，第199期起只记录实战结果。',
      },
      target: { year: latest.year, No: latest.No + 1 },
      models,
      integrity: this.buildIntegrity(history),
      historyMeta: { count: history.length, latest: this.publicSource(latest) },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildModel(
    history: DrawRow[],
    frozenIndex: number,
    definition: ModelDefinition,
  ) {
    const rows = this.buildRows(history, definition);
    const frozenRows = rows
      .filter((row) => this.isAtOrBeforeFreeze(row))
      .slice(-500);
    const prospectiveRows = rows.filter((row) => this.isProspective(row));
    const recentRows = rows.slice(-20);

    return {
      ...definition,
      status: 'frozen',
      comparisonFrozenAt: { year: this.frozenYear, No: this.frozenAtNo },
      prediction: this.pick(history, history.length, definition),
      frozenBacktests: {
        backtest20: this.summarize(frozenRows.slice(-20)),
        backtest50: this.summarize(frozenRows.slice(-50)),
        backtest100: this.summarize(frozenRows.slice(-100)),
        backtest200: this.summarize(frozenRows.slice(-200)),
        backtest500: this.summarize(frozenRows),
      },
      segments: [0, 1, 2, 3, 4].map((index) => {
        const segmentRows = frozenRows.slice(index * 100, (index + 1) * 100);
        return {
          index: index + 1,
          label: `第${index + 1}段`,
          start: this.publicPeriod(segmentRows[0]),
          end: this.publicPeriod(segmentRows[segmentRows.length - 1]),
          ...this.summarize(segmentRows),
        };
      }),
      validation: {
        ...this.summarize(prospectiveRows, true),
        kind: 'prospective-frozen',
        start: { year: this.frozenYear, No: this.prospectiveStartNo },
      },
      recent: {
        ...this.summarize(recentRows, true),
        kind: 'latest-observations',
      },
      audit: {
        frozenRowCount: frozenRows.length,
        frozenIndex,
        allFiveSegmentsComplete: frozenRows.length === 500,
      },
    };
  }

  private buildRows(history: DrawRow[], definition: ModelDefinition) {
    const rows = [];
    for (let t = definition.largestLag; t < history.length; t++) {
      const prediction = this.pick(history, t, definition);
      const actual = history[t];
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        anchors: prediction.anchors.map((anchor) => ({
          label: anchor.label,
          value: anchor.value,
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

  private pick(history: DrawRow[], t: number, definition: ModelDefinition) {
    let rawValue = 0;
    let anchors: Array<{
      label: string;
      value: number;
      display: string;
      source: ReturnType<EliteFourKillService['publicSource']>;
    }> = [];
    let calculation = '';

    if (definition.code === 'F') {
      const source = history[t - 42];
      const x = source.numbers[6];
      rawValue = -4 * x * x + x + 17;
      anchors = [this.anchor('42期前第7位 x', x, source)];
      calculation = `−4 × ${x}² + ${x} + 17 = ${rawValue}`;
    } else if (definition.code === 'Q17') {
      const source = history[t - 17];
      const x = source.numbers[0];
      rawValue = 8 * x * x - 7 * x + 18;
      anchors = [this.anchor('17期前第1位 x', x, source)];
      calculation = `8 × ${x}² − 7 × ${x} + 18 = ${rawValue}`;
    } else if (definition.code === 'DT') {
      const nearSource = history[t - 22];
      const farSource = history[t - 34];
      const x = nearSource.numbers[5];
      const y = farSource.numbers[5];
      rawValue = x + 2 * y + 47;
      anchors = [
        this.anchor('22期前第6位 x', x, nearSource),
        this.anchor('34期前第6位 y', y, farSource),
      ];
      calculation = `${x} + 2 × ${y} + 47 = ${rawValue}`;
    } else {
      const source = history[t - 63];
      const x = source.numbers[0];
      rawValue = 3 * x + 38;
      anchors = [this.anchor('63期前第1位 x', x, source)];
      calculation = `3 × ${x} + 38 = ${rawValue}`;
    }

    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number,
      display: String(number).padStart(2, '0'),
      rawValue,
      cycles,
      anchors,
      formula: `${calculation} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × (${cycles}) = ${number}`,
      reason: `${anchors.map((item) => `${item.label}=${item.display}`).join('，')}，固定公式循环回绕得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private anchor(label: string, value: number, source: DrawRow) {
    return {
      label,
      value,
      display: String(value).padStart(2, '0'),
      source: this.publicSource(source),
    };
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
        key: 'quadraticAnchor42Position7F',
        code: 'F',
        name: '新F · 42期七码二次',
        shortName: '新F',
        family: 'quadratic',
        formula: '−4x² + x + 17',
        description: '读取42期前第7位x，使用分段稳定性筛选出的固定二次回绕公式。',
        largestLag: 42,
        originalFrozenAt: { year: 2026, No: 198 },
      },
      {
        key: 'quadraticAnchor17Position1',
        code: 'Q17',
        name: '17期首位二次锚点',
        shortName: '17期二次',
        family: 'quadratic',
        formula: '8x² − 7x + 18',
        description: '读取17期前第1位x，以固定二次公式循环回绕。',
        largestLag: 17,
        originalFrozenAt: { year: 2026, No: 180 },
      },
      {
        key: 'dualTimePosition6Linear',
        code: 'DT',
        name: '双时间尺度锚点',
        shortName: '双时间',
        family: 'dual',
        formula: 'x + 2y + 47',
        description: '同时读取22期前和34期前的第6位，形成短长双锚点。',
        largestLag: 34,
        originalFrozenAt: { year: 2026, No: 180 },
      },
      {
        key: 'linearAnchor63Position1',
        code: 'L63',
        name: '63期首位线性锚点',
        shortName: '63期线性',
        family: 'linear',
        formula: '3x + 38',
        description: '读取63期前第1位x，以固定线性公式循环回绕。',
        largestLag: 63,
        originalFrozenAt: { year: 2026, No: 198 },
      },
    ];
  }

  private buildIntegrity(history: DrawRow[]) {
    const gaps: Array<{ year: number; from: number; to: number }> = [];
    for (let index = 1; index < history.length; index++) {
      const previous = history[index - 1];
      const current = history[index];
      if (previous.year === current.year && current.No - previous.No > 1) {
        gaps.push({ year: current.year, from: previous.No + 1, to: current.No - 1 });
      }
    }
    return {
      complete: gaps.length === 0,
      gaps,
      message: gaps.length
        ? `检测到${gaps.length}处期号缺口；锚点按当前历史记录顺序计算。`
        : '未检测到同年度期号缺口。',
    };
  }

  private isAtOrBeforeFreeze(row: { year: number; No: number }) {
    return row.year < this.frozenYear ||
      (row.year === this.frozenYear && row.No <= this.frozenAtNo);
  }

  private isProspective(row: { year: number; No: number }) {
    return row.year > this.frozenYear ||
      (row.year === this.frozenYear && row.No >= this.prospectiveStartNo);
  }

  private publicSource(source: DrawRow) {
    return {
      id: source.id,
      year: source.year,
      No: source.No,
      numbers: source.numbers,
    };
  }

  private publicPeriod(row?: { year: number; No: number }) {
    return row ? { year: row.year, No: row.No } : null;
  }

  private wrap(value: number) {
    return ((((value - 1) % 49) + 49) % 49) + 1;
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: Number(row.year || 0),
        No: Number(row.No || 0),
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
      }))
      .filter(
        (row) =>
          row.year > 0 && row.No > 0 &&
          row.numbers.every((number) => number >= 1 && number <= 49),
      )
      .sort((a, b) => a.year - b.year || a.No - b.No || a.id - b.id);
  }
}

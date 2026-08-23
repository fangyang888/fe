import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year: number;
  No: number;
  numbers: number[];
};

type AnchorDefinition = {
  key: string;
  code: 'G' | 'H' | 'I' | 'J';
  name: string;
  formula: string;
  description: string;
  lag: number;
  position: number;
  calculate: (x: number) => number;
};

@Injectable()
export class SelectedAnchorSuiteService {
  private readonly researchYear = 2026;
  private readonly researchCutoffNo = 198;
  private readonly observedStartNo = 199;
  private readonly selectionLockedAtNo = 211;
  private readonly trueForwardStartNo = 212;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const definitions = this.definitions();
    const longestLag = Math.max(...definitions.map((item) => item.lag));
    const cutoffIndex = history.findIndex(
      (row) =>
        row.year === this.researchYear && row.No === this.researchCutoffNo,
    );

    if (cutoffIndex < longestLag + 500 - 1) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: 'G～J锚点页面需要2026年第198期以及此前完整500期历史。',
      };
    }

    const latest = history[history.length - 1];
    return {
      status: 'selection-locked',
      strategy: {
        key: 'selectedAnchorSuiteGHIJ',
        name: 'G～J 新锚点观察',
        modelCount: definitions.length,
        researchCutoff: {
          year: this.researchYear,
          No: this.researchCutoffNo,
        },
        observedStart: {
          year: this.researchYear,
          No: this.observedStartNo,
        },
        selectionLockedAt: {
          year: this.researchYear,
          No: this.selectionLockedAtNo,
        },
        trueForwardStart: {
          year: this.researchYear,
          No: this.trueForwardStartNo,
        },
        theoreticalBaseline: 42 / 49,
        description:
          'G～J四个候选的研究统计固定截止到198期；199～211期保留为选定前观察记录，用户选定后从212期开始累计新的真实前瞻。',
      },
      target: { year: latest.year, No: latest.No + 1 },
      models: definitions.map((definition) =>
        this.buildModel(history, definition),
      ),
      integrity: this.buildIntegrity(history),
      historyMeta: {
        count: history.length,
        latest: this.publicSource(latest),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildModel(history: DrawRow[], definition: AnchorDefinition) {
    const rows = this.buildRows(history, definition);
    const frozenRows = rows
      .filter((row) => this.isAtOrBeforeResearchCutoff(row))
      .slice(-500);
    const observedRows = rows.filter(
      (row) =>
        row.year === this.researchYear &&
        row.No >= this.observedStartNo &&
        row.No <= this.selectionLockedAtNo,
    );
    const forwardRows = rows.filter((row) => this.isTrueForward(row));
    const { calculate: _calculate, ...publicDefinition } = definition;

    return {
      ...publicDefinition,
      status: 'locked',
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
      observedValidation: {
        ...this.summarize(observedRows, true),
        kind: 'pre-selection-observation',
        start: { year: this.researchYear, No: this.observedStartNo },
        end: { year: this.researchYear, No: this.selectionLockedAtNo },
      },
      forwardValidation: {
        ...this.summarize(forwardRows, true),
        kind: 'post-selection-forward',
        start: { year: this.researchYear, No: this.trueForwardStartNo },
      },
      recent: {
        ...this.summarize(rows.slice(-20), true),
        kind: 'latest-observations',
      },
    };
  }

  private buildRows(history: DrawRow[], definition: AnchorDefinition) {
    const rows = [];
    for (let t = definition.lag; t < history.length; t++) {
      const prediction = this.pick(history, t, definition);
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
    return rows;
  }

  private pick(
    history: DrawRow[],
    t: number,
    definition: AnchorDefinition,
  ) {
    const source = history[t - definition.lag];
    const x = source.numbers[definition.position - 1];
    const rawValue = definition.calculate(x);
    const number = this.wrap(rawValue);
    const cycles = Math.floor((rawValue - number) / 49);
    return {
      number,
      display: String(number).padStart(2, '0'),
      anchorNumber: x,
      anchorDisplay: String(x).padStart(2, '0'),
      source: this.publicSource(source),
      rawValue,
      cycles,
      formula: `${this.formatCalculation(definition.code, x, rawValue)} → ${String(number).padStart(2, '0')}`,
      wrapFormula: `${rawValue} − 49 × (${cycles}) = ${number}`,
      reason: `读取${definition.lag}期前第${definition.position}位 x=${String(x).padStart(2, '0')}，按固定${definition.code}公式回绕得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private formatCalculation(code: AnchorDefinition['code'], x: number, raw: number) {
    if (code === 'G') return `28 × ${x} + 34 = ${raw}`;
    if (code === 'H') return `48 × ${x} + 26 = ${raw}`;
    if (code === 'I') return `−2 × ${x}² + 4 × ${x} + 42 = ${raw}`;
    return `−2 × ${x}² + 37 = ${raw}`;
  }

  private definitions(): AnchorDefinition[] {
    return [
      {
        key: 'linearAnchor221Position1G',
        code: 'G',
        name: 'G · 221期首位线性锚点',
        formula: '28x + 34',
        description: '五段均保持92～93次成功，是四个新锚点中长期分段最均匀的主候选。',
        lag: 221,
        position: 1,
        calculate: (x) => 28 * x + 34,
      },
      {
        key: 'mirrorAnchor207Position5H',
        code: 'H',
        name: 'H · 207期第五位镜像锚点',
        formula: '48x + 26（模49等价于26−x）',
        description: '使用207期前第5位，公式简单，冻结后最近200期表现较强。',
        lag: 207,
        position: 5,
        calculate: (x) => 48 * x + 26,
      },
      {
        key: 'quadraticAnchor84Position5I',
        code: 'I',
        name: 'I · 84期第五位二次锚点',
        formula: '−2x² + 4x + 42',
        description: '与现有路由二次锚点不同，读取84期前第5位进行固定二次回绕。',
        lag: 84,
        position: 5,
        calculate: (x) => -2 * x * x + 4 * x + 42,
      },
      {
        key: 'quadraticAnchor96Position3J',
        code: 'J',
        name: 'J · 96期第三位二次锚点',
        formula: '−2x² + 37',
        description: '五段集中在91～92次成功，属于波动范围较窄的二次候选。',
        lag: 96,
        position: 3,
        calculate: (x) => -2 * x * x + 37,
      },
    ];
  }

  private summarize(rows: any[], includeRows = false) {
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
      ...(includeRows ? { rows: rows.slice().reverse() } : {}),
    };
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

  private isAtOrBeforeResearchCutoff(row: { year: number; No: number }) {
    return row.year < this.researchYear ||
      (row.year === this.researchYear && row.No <= this.researchCutoffNo);
  }

  private isTrueForward(row: { year: number; No: number }) {
    return row.year > this.researchYear ||
      (row.year === this.researchYear && row.No >= this.trueForwardStartNo);
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

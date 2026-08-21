import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year: number;
  No: number;
  numbers: number[];
};

type BaseKey = 'K' | 'Q191' | 'C176';

type BaseDefinition = {
  key: BaseKey;
  name: string;
  lag: number;
  position: number;
  formula: string;
  calculate: (x: number) => number;
};

type Candidate = {
  key: BaseKey;
  number: number;
  display: string;
  anchorNumber: number;
  anchorDisplay: string;
  source: ReturnType<AdaptiveAnchorSuiteService['publicSource']>;
};

type AuditRow = {
  year: number;
  No: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  selectedBase: BaseKey;
  success: boolean;
  basePredictions: Record<BaseKey, number>;
  scores?: Record<string, number>;
  metaChoice?: string;
};

@Injectable()
export class AdaptiveAnchorSuiteService {
  private readonly researchYear = 2026;
  private readonly researchCutoffNo = 198;
  private readonly observedStartNo = 199;
  private readonly selectionLockedAtNo = 211;
  private readonly trueForwardStartNo = 212;
  private readonly windows = [10, 20, 50, 100, 200] as const;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const cutoffIndex = history.findIndex(
      (row) =>
        row.year === this.researchYear && row.No === this.researchCutoffNo,
    );
    const metaStart = 279;

    if (cutoffIndex < metaStart + 200 - 1) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: 'K、R50、R20/50、M10页面需要2026年第198期以及此前完整200期可回测历史。',
      };
    }

    const baseDefinitions = this.baseDefinitions();
    const baseSuccess = this.buildBaseSuccess(history, baseDefinitions);
    const kRows = this.buildKRows(history, baseDefinitions[0]);
    const r50Rows = this.buildR50Rows(history, baseDefinitions, baseSuccess);
    const r2050Rows = this.buildR2050Rows(history, baseDefinitions, baseSuccess);
    const m10Rows = this.buildM10Rows(history, baseDefinitions, baseSuccess);
    const latest = history[history.length - 1];

    const algorithms = [
      this.buildAlgorithm(
        history,
        {
          key: 'K',
          code: 'K',
          name: 'K',
          description: '固定读取186期前第1位，使用21x + 6回绕到1～49。',
          rule: '固定 K：186期前第1位，21x + 6。',
        },
        kRows,
        this.makeKPrediction(history, baseDefinitions[0]),
      ),
      this.buildAlgorithm(
        history,
        {
          key: 'R50',
          code: 'R50',
          name: 'R50',
          description: '比较K、Q191、C176此前50期失败数，选择失败最少者。',
          rule: '近50期失败数最少；并列顺序 K → Q191 → C176。',
        },
        r50Rows.rows,
        r50Rows.next,
      ),
      this.buildAlgorithm(
        history,
        {
          key: 'R20_50',
          code: 'R20/50',
          name: 'R20/50',
          description: '兼顾短期20期和中期50期表现，逐期选择综合失败分最低者。',
          rule: '失败分 = 近20期失败 + 0.5 × 近50期失败；并列 K → Q191 → C176。',
        },
        r2050Rows.rows,
        r2050Rows.next,
      ),
      this.buildAlgorithm(
        history,
        {
          key: 'M10',
          code: 'M10',
          name: 'M10双层择优',
          description: '先由两个不同时间尺度的择优器各自产生结果，再用此前10期实绩选择其中一个。',
          rule: '第一层A/B分别择优；第二层比较A/B近10期失败数，并列选择A。',
        },
        m10Rows.rows,
        m10Rows.next,
      ),
    ];

    return {
      status: 'selection-locked',
      strategy: {
        key: 'adaptiveAnchorSuite',
        name: 'K · R50 · R20/50 · M10双层择优',
        algorithmCount: algorithms.length,
        windows: this.windows,
        researchCutoff: { year: this.researchYear, No: this.researchCutoffNo },
        observedStart: { year: this.researchYear, No: this.observedStartNo },
        selectionLockedAt: { year: this.researchYear, No: this.selectionLockedAtNo },
        trueForwardStart: { year: this.researchYear, No: this.trueForwardStartNo },
        theoreticalBaseline: 42 / 49,
        description: '算法规则与选择参数在212期起统一冻结；研究期、冻结前观察和冻结后真实前瞻分别统计。',
      },
      target: { year: latest.year, No: latest.No + 1 },
      baseModels: baseDefinitions.map(({ calculate: _calculate, ...item }) => item),
      algorithms,
      integrity: this.buildIntegrity(history),
      historyMeta: { count: history.length, latest: this.publicSource(latest) },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildAlgorithm(
    history: DrawRow[],
    definition: {
      key: string;
      code: string;
      name: string;
      description: string;
      rule: string;
    },
    rows: AuditRow[],
    prediction: any,
  ) {
    const frozenRows = rows.filter((row) => this.isAtOrBeforeResearchCutoff(row));
    const observedRows = rows.filter(
      (row) =>
        row.year === this.researchYear &&
        row.No >= this.observedStartNo &&
        row.No <= this.selectionLockedAtNo,
    );
    const forwardRows = rows.filter((row) => this.isTrueForward(row));

    return {
      ...definition,
      status: 'locked-from-212',
      prediction,
      rollingBacktests: this.windowSummaries(rows),
      frozenBacktests: this.windowSummaries(frozenRows),
      observedValidation: {
        ...this.summarize(observedRows, true),
        kind: 'pre-freeze-observation',
        start: { year: this.researchYear, No: this.observedStartNo },
        end: { year: this.researchYear, No: this.selectionLockedAtNo },
      },
      forwardValidation: {
        ...this.summarize(forwardRows, true),
        kind: 'post-freeze-forward',
        start: { year: this.researchYear, No: this.trueForwardStartNo },
      },
      recent: {
        ...this.summarize(rows.slice(-20), true),
        kind: 'latest-observations',
      },
      historyCount: history.length,
    };
  }

  private buildKRows(history: DrawRow[], definition: BaseDefinition) {
    const rows: AuditRow[] = [];
    const comparisonStart = Math.max(...this.baseDefinitions().map((item) => item.lag));
    for (let t = comparisonStart; t < history.length; t++) {
      const candidate = this.pick(history, t, definition);
      rows.push(this.auditRow(history, t, candidate, this.basePredictionMap(history, t)));
    }
    return rows;
  }

  private buildR50Rows(
    history: DrawRow[],
    definitions: BaseDefinition[],
    baseSuccess: Record<BaseKey, Array<boolean | undefined>>,
  ) {
    const start = Math.max(...definitions.map((item) => item.lag)) + 50;
    const rows: AuditRow[] = [];
    let next: any = null;
    for (let t = start; t <= history.length; t++) {
      const scores = Object.fromEntries(
        definitions.map((item) => [item.key, this.failureCount(baseSuccess[item.key], t, 50)]),
      ) as Record<BaseKey, number>;
      const selected = this.selectByScore(scores, ['K', 'Q191', 'C176']);
      const candidate = this.pick(history, t, this.definition(selected));
      const prediction = this.predictionDetails(candidate, selected, this.basePredictionMap(history, t), scores,
        `此前50期失败数最低，选择${selected}。`);
      if (t === history.length) next = prediction;
      else rows.push(this.auditRow(history, t, candidate, prediction.basePredictions, scores));
    }
    return { rows, next };
  }

  private buildR2050Rows(
    history: DrawRow[],
    definitions: BaseDefinition[],
    baseSuccess: Record<BaseKey, Array<boolean | undefined>>,
  ) {
    const start = Math.max(...definitions.map((item) => item.lag)) + 50;
    const rows: AuditRow[] = [];
    let next: any = null;
    for (let t = start; t <= history.length; t++) {
      const scores = Object.fromEntries(
        definitions.map((item) => [
          item.key,
          this.failureCount(baseSuccess[item.key], t, 20) +
            0.5 * this.failureCount(baseSuccess[item.key], t, 50),
        ]),
      ) as Record<BaseKey, number>;
      const selected = this.selectByScore(scores, ['K', 'Q191', 'C176']);
      const candidate = this.pick(history, t, this.definition(selected));
      const prediction = this.predictionDetails(candidate, selected, this.basePredictionMap(history, t), scores,
        `20/50综合失败分最低，选择${selected}。`);
      if (t === history.length) next = prediction;
      else rows.push(this.auditRow(history, t, candidate, prediction.basePredictions, scores));
    }
    return { rows, next };
  }

  private buildM10Rows(
    history: DrawRow[],
    definitions: BaseDefinition[],
    baseSuccess: Record<BaseKey, Array<boolean | undefined>>,
  ) {
    const maxLag = Math.max(...definitions.map((item) => item.lag));
    const aStart = maxLag + 78;
    const bStart = maxLag + 73;
    const aChoices: Array<BaseKey | undefined> = [];
    const bChoices: Array<BaseKey | undefined> = [];
    const aSuccess: Array<boolean | undefined> = [];
    const bSuccess: Array<boolean | undefined> = [];
    const aScores: Array<Record<BaseKey, number> | undefined> = [];
    const bScores: Array<Record<BaseKey, number> | undefined> = [];

    for (let t = aStart; t <= history.length; t++) {
      const scores = Object.fromEntries(definitions.map((item) => {
        const predicted = this.pick(history, t, item).number;
        return [
          item.key,
          this.failureCount(baseSuccess[item.key], t, 22) +
            0.45 * this.failureCount(baseSuccess[item.key], t, 78) +
            0.8 * this.appearanceCount(history, t, 22, predicted),
        ];
      })) as Record<BaseKey, number>;
      const choice = this.selectByScore(scores, ['Q191', 'K', 'C176']);
      aChoices[t] = choice;
      aScores[t] = scores;
      if (t < history.length) {
        aSuccess[t] = !history[t].numbers.includes(this.pick(history, t, this.definition(choice)).number);
      }
    }

    let previousB: BaseKey = 'K';
    for (let t = bStart; t <= history.length; t++) {
      const scores = Object.fromEntries(definitions.map((item) => {
        const predicted = this.pick(history, t, item).number;
        return [
          item.key,
          this.failureCount(baseSuccess[item.key], t, 25) +
            0.75 * this.failureCount(baseSuccess[item.key], t, 73) +
            0.9 * this.appearanceCount(history, t, 49, predicted),
        ];
      })) as Record<BaseKey, number>;
      const best: BaseKey = this.selectByScore(scores, ['K', 'C176', 'Q191']);
      const choice: BaseKey = scores[previousB] <= scores[best] + 0.1 ? previousB : best;
      bChoices[t] = choice;
      bScores[t] = scores;
      previousB = choice;
      if (t < history.length) {
        bSuccess[t] = !history[t].numbers.includes(this.pick(history, t, this.definition(choice)).number);
      }
    }

    const start = Math.max(aStart, bStart) + 10;
    const rows: AuditRow[] = [];
    let next: any = null;
    for (let t = start; t <= history.length; t++) {
      const metaScores = {
        A: this.failureCount(aSuccess, t, 10),
        B: this.failureCount(bSuccess, t, 10),
      };
      const metaChoice = metaScores.A <= metaScores.B ? 'A' : 'B';
      const selected = (metaChoice === 'A' ? aChoices[t] : bChoices[t]) as BaseKey;
      const candidate = this.pick(history, t, this.definition(selected));
      const basePredictions = this.basePredictionMap(history, t);
      const scores = {
        A10: metaScores.A,
        B10: metaScores.B,
        selectedFirstLevelScore:
          (metaChoice === 'A' ? aScores[t] : bScores[t])?.[selected] ?? 0,
      };
      const prediction = {
        ...this.predictionDetails(candidate, selected, basePredictions, scores,
          `第二层比较近10期：A失败${metaScores.A}次、B失败${metaScores.B}次，选择${metaChoice}，最终采用${selected}。`),
        metaChoice,
        firstLevelChoices: { A: aChoices[t], B: bChoices[t] },
      };
      if (t === history.length) next = prediction;
      else {
        rows.push({
          ...this.auditRow(history, t, candidate, basePredictions, scores),
          metaChoice,
        });
      }
    }
    return { rows, next };
  }

  private makeKPrediction(history: DrawRow[], definition: BaseDefinition) {
    const candidate = this.pick(history, history.length, definition);
    return this.predictionDetails(
      candidate,
      'K',
      this.basePredictionMap(history, history.length),
      undefined,
      '固定使用K，不进行动态切换。',
    );
  }

  private predictionDetails(
    candidate: Candidate,
    selectedBase: BaseKey,
    basePredictions: Record<BaseKey, number>,
    scores: Record<string, number> | undefined,
    reason: string,
  ) {
    return {
      number: candidate.number,
      display: candidate.display,
      selectedBase,
      anchorNumber: candidate.anchorNumber,
      anchorDisplay: candidate.anchorDisplay,
      source: candidate.source,
      basePredictions,
      scores,
      reason,
    };
  }

  private auditRow(
    history: DrawRow[],
    t: number,
    candidate: Candidate,
    basePredictions: Record<BaseKey, number>,
    scores?: Record<string, number>,
  ): AuditRow {
    const actual = history[t];
    return {
      year: actual.year,
      No: actual.No,
      actualNumbers: actual.numbers,
      predictedNumber: candidate.number,
      predictedDisplay: candidate.display,
      selectedBase: candidate.key,
      success: !actual.numbers.includes(candidate.number),
      basePredictions,
      scores,
    };
  }

  private buildBaseSuccess(history: DrawRow[], definitions: BaseDefinition[]) {
    const output = {
      K: [],
      Q191: [],
      C176: [],
    } as Record<BaseKey, Array<boolean | undefined>>;
    for (const definition of definitions) {
      for (let t = definition.lag; t < history.length; t++) {
        output[definition.key][t] = !history[t].numbers.includes(this.pick(history, t, definition).number);
      }
    }
    return output;
  }

  private basePredictionMap(history: DrawRow[], t: number) {
    return Object.fromEntries(
      this.baseDefinitions().map((item) => [item.key, this.pick(history, t, item).number]),
    ) as Record<BaseKey, number>;
  }

  private pick(history: DrawRow[], t: number, definition: BaseDefinition): Candidate {
    const source = history[t - definition.lag];
    const x = source.numbers[definition.position - 1];
    const number = this.wrap(definition.calculate(x));
    return {
      key: definition.key,
      number,
      display: String(number).padStart(2, '0'),
      anchorNumber: x,
      anchorDisplay: String(x).padStart(2, '0'),
      source: this.publicSource(source),
    };
  }

  private selectByScore(scores: Record<BaseKey, number>, order: BaseKey[]) {
    return order.reduce((best, key) => scores[key] < scores[best] ? key : best, order[0]);
  }

  private failureCount(values: Array<boolean | undefined>, t: number, window: number) {
    let failures = 0;
    for (let index = t - window; index < t; index++) {
      if (values[index] === false) failures++;
    }
    return failures;
  }

  private appearanceCount(history: DrawRow[], t: number, window: number, number: number) {
    let count = 0;
    for (let index = t - window; index < t; index++) {
      if (history[index].numbers.includes(number)) count++;
    }
    return count;
  }

  private windowSummaries(rows: AuditRow[]) {
    return Object.fromEntries(
      this.windows.map((window) => [`backtest${window}`, this.summarize(rows.slice(-window))]),
    );
  }

  private summarize(rows: AuditRow[], includeRows = false) {
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

  private baseDefinitions(): BaseDefinition[] {
    return [
      { key: 'K', name: 'K · 186期首位线性', lag: 186, position: 1, formula: '21x + 6', calculate: (x) => 21 * x + 6 },
      { key: 'Q191', name: 'Q191 · 191期第二位二次', lag: 191, position: 2, formula: '2x² − 4x + 7', calculate: (x) => 2 * x * x - 4 * x + 7 },
      { key: 'C176', name: 'C176 · 176期第三位三次', lag: 176, position: 3, formula: '−21x³ − 20x² − 3x − 15', calculate: (x) => -21 * x ** 3 - 20 * x ** 2 - 3 * x - 15 },
    ];
  }

  private definition(key: BaseKey) {
    return this.baseDefinitions().find((item) => item.key === key) as BaseDefinition;
  }

  private isAtOrBeforeResearchCutoff(row: { year: number; No: number }) {
    return row.year < this.researchYear ||
      (row.year === this.researchYear && row.No <= this.researchCutoffNo);
  }

  private isTrueForward(row: { year: number; No: number }) {
    return row.year > this.researchYear ||
      (row.year === this.researchYear && row.No >= this.trueForwardStartNo);
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

  public publicSource(source: DrawRow) {
    return { id: source.id, year: source.year, No: source.No, numbers: source.numbers };
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
      .filter((row) => row.year > 0 && row.No > 0 && row.numbers.every((number) => number >= 1 && number <= 49))
      .sort((a, b) => a.year - b.year || a.No - b.No || a.id - b.id);
  }
}

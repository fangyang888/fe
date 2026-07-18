import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { GapScoreKillService } from './gap-score-kill.service';
import { StateRiskKillService } from './state-risk-kill.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };
type AlgorithmKey = 'gap' | 'state' | 'q53' | 'a14' | 'q49' | 'q17' | 'dual';

@Injectable()
export class TieredKillComboService {
  private readonly labels: Record<AlgorithmKey, string> = {
    gap: 'Gap F20',
    state: '状态条件风险第5位',
    q53: '53期二次锚点',
    a14: '14期锚点＋期号相位',
    q49: '49期七码二次锚点',
    q17: '17期首位二次锚点',
    dual: '双时间尺度锚点',
  };

  private readonly plans: Array<{
    key: string;
    name: string;
    nominalCount: number;
    theoreticalRate: number;
    members: AlgorithmKey[];
  }> = [
    {
      key: 'base4', name: '基础4个', nominalCount: 4, theoreticalRate: 0.5282806925,
      members: ['q53', 'a14', 'q17', 'dual'],
    },
    {
      key: 'enhanced6', name: '增强6个', nominalCount: 6, theoreticalRate: 0.3751326533,
      members: ['gap', 'q53', 'a14', 'q49', 'q17', 'dual'],
    },
    {
      key: 'strong7', name: '最强7个', nominalCount: 7, theoreticalRate: 0.314064547,
      members: ['gap', 'state', 'q53', 'a14', 'q49', 'q17', 'dual'],
    },
  ];

  constructor(
    private readonly historyService: HistoryService,
    private readonly gapScoreKillService: GapScoreKillService,
    private readonly stateRiskKillService: StateRiskKillService,
  ) {}

  async getReport() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    if (history.length < 500) {
      return { status: 'insufficient-history', historyCount: history.length, message: '组合统计至少需要500期历史。' };
    }

    const gap = this.gapScoreKillService.buildWalkForwardTimelineFromRows(rawRows);
    const state = this.stateRiskKillService.buildWalkForwardTimelineFromRows(rawRows);
    const gapMap = new Map(gap.rows.map((row) => [this.periodKey(row.year, row.No), row.number]));
    const stateMap = new Map(state.rows.map((row) => [this.periodKey(row.year, row.No), row.number]));
    const rowsByPlan = new Map(this.plans.map((plan) => [plan.key, [] as any[]]));

    for (let t = 300; t < history.length; t++) {
      const actual = history[t];
      const predictions = this.predictionsAt(history, t, gapMap, stateMap);
      for (const plan of this.plans) {
        const sources = plan.members.map((key) => ({ key, label: this.labels[key], number: predictions[key] }));
        if (sources.some((item) => !item.number)) continue;
        const numbers = [...new Set(sources.map((item) => item.number))];
        rowsByPlan.get(plan.key)?.push({
          year: actual.year,
          No: actual.No,
          actualNumbers: actual.numbers,
          sources,
          numbers,
          uniqueCount: numbers.length,
          success: numbers.every((number) => !actual.numbers.includes(number)),
        });
      }
    }

    const currentPredictions = this.nextPredictions(history, gap.next, state.next);
    const reports = this.plans.map((plan) => {
      const rows = rowsByPlan.get(plan.key) || [];
      const frozenRows = rows.filter((row) => this.isAtOrBefore(row, 2026, 180));
      const validationRows = rows.filter((row) => Number(row.year) === 2026 && Number(row.No) >= 181 && Number(row.No) <= 198);
      const liveRows = rows.filter(
        (row) => Number(row.year) > 2026 || (Number(row.year) === 2026 && Number(row.No) >= 199),
      );
      const currentSources = plan.members.map((key) => ({ key, label: this.labels[key], number: currentPredictions[key] }));
      const currentNumbers = [...new Set(currentSources.map((item) => item.number).filter(Boolean))];
      return {
        ...plan,
        members: currentSources,
        currentNumbers,
        currentUniqueCount: currentNumbers.length,
        frozenBacktests: {
          backtest20: this.summarize(frozenRows.slice(-20)),
          backtest50: this.summarize(frozenRows.slice(-50)),
          backtest100: this.summarize(frozenRows.slice(-100)),
          backtest200: this.summarize(frozenRows.slice(-200)),
          backtest500: this.summarize(frozenRows.slice(-500)),
          cutoff: { year: 2026, No: 180 },
        },
        validation: { ...this.summarize(validationRows), start: { year: 2026, No: 181 }, end: { year: 2026, No: 198 } },
        live: { ...this.summarize(liveRows), start: { year: 2026, No: 199 } },
      };
    });

    return {
      status: 'ready',
      plans: reports,
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      methodology: '组合成员仅根据2026年第180期及以前的数据固定；181-198期为验证，199期起为新增实盘统计。任一杀码开出即判整组失败。',
      generatedAt: new Date().toISOString(),
    };
  }

  private predictionsAt(
    history: DrawRow[],
    t: number,
    gapMap: Map<string, number>,
    stateMap: Map<string, number>,
  ): Record<AlgorithmKey, number> {
    const key = this.periodKey(history[t].year, history[t].No);
    return {
      gap: Number(gapMap.get(key)),
      state: Number(stateMap.get(key)),
      q53: this.wrap(2 * history[t - 53].numbers[1] ** 2 + 3 * history[t - 53].numbers[1] - 7),
      a14: this.wrap(-3 * history[t - 14].numbers[3] + 2 * Number(history[t - 1].No || 0) - 19),
      q49: this.wrap(-4 * history[t - 49].numbers[6] ** 2 + history[t - 49].numbers[6] + 20),
      q17: this.wrap(8 * history[t - 17].numbers[0] ** 2 - 7 * history[t - 17].numbers[0] + 18),
      dual: this.wrap(history[t - 22].numbers[5] + 2 * history[t - 34].numbers[5] + 47),
    };
  }

  private nextPredictions(history: DrawRow[], gap: number | null, state: number | null): Record<AlgorithmKey, number> {
    const t = history.length;
    return {
      gap: Number(gap),
      state: Number(state),
      q53: this.wrap(2 * history[t - 53].numbers[1] ** 2 + 3 * history[t - 53].numbers[1] - 7),
      a14: this.wrap(-3 * history[t - 14].numbers[3] + 2 * Number(history[t - 1].No || 0) - 19),
      q49: this.wrap(-4 * history[t - 49].numbers[6] ** 2 + history[t - 49].numbers[6] + 20),
      q17: this.wrap(8 * history[t - 17].numbers[0] ** 2 - 7 * history[t - 17].numbers[0] + 18),
      dual: this.wrap(history[t - 22].numbers[5] + 2 * history[t - 34].numbers[5] + 47),
    };
  }

  private summarize(rows: any[]) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      averageUniqueCount: rows.length ? rows.reduce((sum, row) => sum + row.uniqueCount, 0) / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private isAtOrBefore(row: any, year: number, No: number) {
    return Number(row.year) < year || (Number(row.year) === year && Number(row.No) <= No);
  }

  private periodKey(year?: number, No?: number) { return `${Number(year || 0)}-${Number(No || 0)}`; }
  private wrap(value: number) { return ((value - 1) % 49 + 49) % 49 + 1; }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows.map((row) => ({
      id: Number(row.id || 0), year: row.year, No: row.No,
      numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    })).filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || a.id - b.id);
  }
}

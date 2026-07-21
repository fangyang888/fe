import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { GapScoreKillService } from './gap-score-kill.service';
import { StateRiskKillService } from './state-risk-kill.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };
type LaneKey =
  | 'q53'
  | 'a14'
  | 'q49'
  | 'q17'
  | 'dual'
  | 'tail'
  | 'gap'
  | 'state'
  | 'cool1'
  | 'cool2'
  | 'cool3';

type LanePrediction = Record<LaneKey, number>;

interface LaneDefinition {
  key: LaneKey;
  label: string;
  family: string;
}

interface Candidate {
  number: number;
  display: string;
  avoidScore: number;
  representativeLane: LaneKey;
  sources: Array<{
    key: LaneKey;
    label: string;
    family: string;
    longRate: number;
    recentRate: number;
    conservativeRate: number;
    samples: number;
  }>;
  families: string[];
}

interface SetOption {
  count: number;
  numbers: Candidate[];
  numberValues: number[];
  sourceLanes: LaneKey[];
  familyCount: number;
  estimatedRate: number;
  conservativeRate: number;
  longRate: number;
  recentRate: number;
  sampleCount: number;
  randomBaseline: number;
  liftOverRandom: number;
}

@Injectable()
export class RiskControlledFiveService {
  private readonly liveStart = { year: 2026, No: 199 };
  private readonly firstEvaluationIndex = 360;
  private readonly longWindow = 160;
  private readonly recentWindow = 40;
  private cache?: { key: string; value: any };

  private readonly lanes: LaneDefinition[] = [
    { key: 'q53', label: '53期二次锚点', family: '长周期二次锚点' },
    { key: 'a14', label: '14期相位锚点', family: '期号相位' },
    { key: 'q49', label: '49期七码锚点', family: '长周期二次锚点' },
    { key: 'q17', label: '17期首位锚点', family: '短周期二次锚点' },
    { key: 'dual', label: '双时间尺度锚点', family: '双尺度锚点' },
    { key: 'tail', label: '期号尾门控', family: '期号相位' },
    { key: 'gap', label: 'Gap F20', family: '间隔序列' },
    { key: 'state', label: '状态条件风险', family: '状态学习' },
    { key: 'cool1', label: '冷却风险第1位', family: '频率冷却' },
    { key: 'cool2', label: '冷却风险第2位', family: '频率冷却' },
    { key: 'cool3', label: '冷却风险第3位', family: '频率冷却' },
  ];

  constructor(
    private readonly historyService: HistoryService,
    private readonly gapScoreKillService: GapScoreKillService,
    private readonly stateRiskKillService: StateRiskKillService,
  ) {}

  async getReport() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    if (history.length < this.firstEvaluationIndex) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `风险受控五码至少需要 ${this.firstEvaluationIndex} 期历史。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}`;
    if (this.cache?.key === cacheKey) return { ...this.cache.value, cache: 'hit' };

    const gapTimeline = this.gapScoreKillService.buildWalkForwardTimelineFromRows(rawRows);
    const stateTimeline = this.stateRiskKillService.buildWalkForwardTimelineFromRows(rawRows);
    const gapMap = new Map(gapTimeline.rows.map((row) => [this.periodKey(row.year, row.No), row.number]));
    const stateMap = new Map(stateTimeline.rows.map((row) => [this.periodKey(row.year, row.No), row.number]));
    const laneMatrix = this.buildLaneMatrix(
      history,
      gapMap,
      stateMap,
      Number(gapTimeline.next),
      Number(stateTimeline.next),
    );

    const rows: any[] = [];
    for (let t = this.firstEvaluationIndex; t < history.length; t++) {
      const selection = this.selectAt(history, laneMatrix, t);
      const actual = history[t];
      const appearedNumbers = selection.selected.numberValues.filter((number) => actual.numbers.includes(number));
      const forcedFiveAppeared = selection.forcedFive.numberValues.filter((number) => actual.numbers.includes(number));
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        mode: selection.mode,
        modeLabel: selection.modeLabel,
        issued: selection.selected.count > 0,
        killNumbers: selection.selected.numberValues,
        appearedNumbers,
        success: selection.selected.count > 0 ? appearedNumbers.length === 0 : null,
        estimatedRate: selection.selected.estimatedRate,
        conservativeRate: selection.selected.conservativeRate,
        randomBaseline: selection.selected.randomBaseline,
        forcedFiveNumbers: selection.forcedFive.numberValues,
        forcedFiveAppeared,
        forcedFiveSuccess: forcedFiveAppeared.length === 0,
      });
    }

    const currentSelection = this.selectAt(history, laneMatrix, history.length);
    const liveRows = rows.filter((row) => this.isAtOrAfter(row, this.liveStart.year, this.liveStart.No));
    const value = {
      status: 'ready',
      currentRecommendation: {
        mode: currentSelection.mode,
        modeLabel: currentSelection.modeLabel,
        gateReason: currentSelection.gateReason,
        issuedCount: currentSelection.selected.count,
        numbers: currentSelection.selected.numbers,
        estimatedSetRate: currentSelection.selected.estimatedRate,
        conservativeSetRate: currentSelection.selected.conservativeRate,
        recentSetRate: currentSelection.selected.recentRate,
        longSetRate: currentSelection.selected.longRate,
        randomBaseline: currentSelection.selected.randomBaseline,
        liftOverRandom: currentSelection.selected.liftOverRandom,
        alternatives: currentSelection.alternatives,
        candidatePool: currentSelection.candidatePool,
      },
      backtests: {
        adaptive20: this.summarizeAdaptive(rows.slice(-20), true),
        adaptive50: this.summarizeAdaptive(rows.slice(-50)),
        adaptive100: this.summarizeAdaptive(rows.slice(-100)),
        adaptive200: this.summarizeAdaptive(rows.slice(-200)),
        adaptive500: this.summarizeAdaptive(rows.slice(-500)),
        forcedFive20: this.summarizeForcedFive(rows.slice(-20)),
        forcedFive50: this.summarizeForcedFive(rows.slice(-50)),
        forcedFive100: this.summarizeForcedFive(rows.slice(-100)),
        forcedFive200: this.summarizeForcedFive(rows.slice(-200)),
        forcedFive500: this.summarizeForcedFive(rows.slice(-500)),
      },
      liveTracking: {
        start: this.liveStart,
        ...this.summarizeAdaptive(liveRows, true),
      },
      methodology: {
        name: '联合风险受控 3–5 杀',
        statement:
          '候选源先按160期长期表现和40期近期表现做贝叶斯收缩，再直接评估来源组合的整组避开率；不把单杀概率相乘。五码不达门槛时自动降为4码、3码或观望。',
        warning:
          '历史滚动结果用于诊断；2026年第199期起单独累计实盘追踪。任何历史100%都不代表未来保证。',
        windows: { long: this.longWindow, recent: this.recentWindow },
        candidatePoolLimit: 8,
        laneCount: this.lanes.length,
      },
      historyMeta: { count: history.length, latest },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private selectAt(history: DrawRow[], laneMatrix: LanePrediction[], t: number) {
    const candidates = this.buildCandidates(history, laneMatrix, t).slice(0, 8);
    const alternatives = [5, 4, 3]
      .map((count) => this.findBestSet(history, laneMatrix, t, candidates, count))
      .filter((option): option is SetOption => Boolean(option));
    const forcedFive = alternatives.find((option) => option.count === 5) || this.emptyOption();
    const bestFour = alternatives.find((option) => option.count === 4);
    const bestThree = alternatives.find((option) => option.count === 3);

    let selected = this.emptyOption();
    let mode = 'observe';
    let modeLabel = '观望';
    let gateReason = '所有档位的保守联合成功率均未达到输出门槛。';

    if (forcedFive.count === 5 && forcedFive.conservativeRate >= 0.7 && forcedFive.recentRate >= 0.72) {
      selected = forcedFive;
      mode = 'five';
      modeLabel = '风险受控5杀';
      gateReason = '五码的长期收缩、近期联合表现同时达到门槛。';
    } else if (bestFour && bestFour.conservativeRate >= 0.76 && bestFour.recentRate >= 0.78) {
      selected = bestFour;
      mode = 'four';
      modeLabel = '自动降档4杀';
      gateReason = '五码证据不足，四码的保守联合成功率达到门槛。';
    } else if (bestThree && bestThree.conservativeRate >= 0.82 && bestThree.recentRate >= 0.82) {
      selected = bestThree;
      mode = 'three';
      modeLabel = '自动降档3杀';
      gateReason = '五码与四码证据不足，保留风险最低的三码。';
    }

    return {
      mode,
      modeLabel,
      gateReason,
      selected,
      forcedFive,
      alternatives,
      candidatePool: candidates,
    };
  }

  private buildCandidates(history: DrawRow[], laneMatrix: LanePrediction[], t: number): Candidate[] {
    const current = laneMatrix[t];
    const grouped = new Map<number, Candidate['sources']>();
    for (const lane of this.lanes) {
      const number = current?.[lane.key];
      if (!Number.isFinite(number)) continue;
      const stats = this.getLaneStats(history, laneMatrix, t, lane.key);
      const sources = grouped.get(number) || [];
      sources.push({
        key: lane.key,
        label: lane.label,
        family: lane.family,
        longRate: stats.longRate,
        recentRate: stats.recentRate,
        conservativeRate: stats.conservativeRate,
        samples: stats.samples,
      });
      grouped.set(number, sources);
    }

    return [...grouped.entries()]
      .map(([number, sources]) => {
        sources.sort((a, b) => b.conservativeRate - a.conservativeRate || b.samples - a.samples);
        const families = [...new Set(sources.map((source) => source.family))];
        const consensusBonus = Math.min(0.025, Math.max(0, families.length - 1) * 0.015);
        return {
          number,
          display: String(number).padStart(2, '0'),
          avoidScore: Math.min(0.995, sources[0].conservativeRate + consensusBonus),
          representativeLane: sources[0].key,
          sources,
          families,
        };
      })
      .sort(
        (a, b) =>
          b.avoidScore - a.avoidScore ||
          b.families.length - a.families.length ||
          b.sources.length - a.sources.length ||
          a.number - b.number,
      );
  }

  private getLaneStats(history: DrawRow[], matrix: LanePrediction[], t: number, lane: LaneKey) {
    const start = Math.max(300, t - this.longWindow);
    const recentStart = Math.max(start, t - this.recentWindow);
    let samples = 0;
    let successes = 0;
    let recentSamples = 0;
    let recentSuccesses = 0;
    for (let s = start; s < t; s++) {
      const number = matrix[s]?.[lane];
      if (!Number.isFinite(number)) continue;
      const success = !history[s].numbers.includes(number);
      samples++;
      if (success) successes++;
      if (s >= recentStart) {
        recentSamples++;
        if (success) recentSuccesses++;
      }
    }
    const long = this.betaEstimate(successes, samples, 24, 42 / 49);
    const recent = this.betaEstimate(recentSuccesses, recentSamples, 18, long.mean);
    const conservativeRate = long.lower * 0.65 + recent.lower * 0.35;
    return {
      samples,
      longRate: long.mean,
      recentRate: recent.mean,
      conservativeRate,
    };
  }

  private findBestSet(
    history: DrawRow[],
    matrix: LanePrediction[],
    t: number,
    candidates: Candidate[],
    count: number,
  ): SetOption | null {
    if (candidates.length < count) return null;
    let best: SetOption | null = null;
    for (const numbers of this.combinations(candidates, count)) {
      const sourceLanes = numbers.map((candidate) => candidate.representativeLane);
      const randomBaseline = this.theoreticalRate(count);
      const start = Math.max(300, t - this.longWindow);
      const recentStart = Math.max(start, t - this.recentWindow);
      let samples = 0;
      let successes = 0;
      let recentSamples = 0;
      let recentSuccesses = 0;
      for (let s = start; s < t; s++) {
        const historicalNumbers = [...new Set(sourceLanes.map((lane) => matrix[s]?.[lane]).filter(Number.isFinite))];
        if (!historicalNumbers.length) continue;
        const success = historicalNumbers.every((number) => !history[s].numbers.includes(number));
        samples++;
        if (success) successes++;
        if (s >= recentStart) {
          recentSamples++;
          if (success) recentSuccesses++;
        }
      }
      const long = this.betaEstimate(successes, samples, 30, randomBaseline);
      const recent = this.betaEstimate(recentSuccesses, recentSamples, 20, long.mean);
      const familyCount = new Set(numbers.flatMap((candidate) => candidate.families)).size;
      const familyPenalty = Math.max(0, count - familyCount) * 0.008;
      const estimatedRate = long.mean * 0.65 + recent.mean * 0.35;
      const conservativeRate = Math.max(0, long.lower * 0.65 + recent.lower * 0.35 - familyPenalty);
      const option: SetOption = {
        count,
        numbers,
        numberValues: numbers.map((candidate) => candidate.number),
        sourceLanes,
        familyCount,
        estimatedRate,
        conservativeRate,
        longRate: long.mean,
        recentRate: recent.mean,
        sampleCount: samples,
        randomBaseline,
        liftOverRandom: estimatedRate - randomBaseline,
      };
      if (
        !best ||
        option.conservativeRate > best.conservativeRate ||
        (option.conservativeRate === best.conservativeRate && option.familyCount > best.familyCount) ||
        (option.conservativeRate === best.conservativeRate && option.familyCount === best.familyCount &&
          option.numbers.reduce((sum, item) => sum + item.avoidScore, 0) >
            best.numbers.reduce((sum, item) => sum + item.avoidScore, 0))
      ) {
        best = option;
      }
    }
    return best;
  }

  private buildLaneMatrix(
    history: DrawRow[],
    gapMap: Map<string, number>,
    stateMap: Map<string, number>,
    nextGap: number,
    nextState: number,
  ) {
    const matrix: LanePrediction[] = [];
    for (let t = 0; t <= history.length; t++) {
      if (t < 300) continue;
      const key = t < history.length ? this.periodKey(history[t].year, history[t].No) : '';
      const cooldown = this.cooldownPicks(history, t, 3);
      matrix[t] = {
        q53: this.wrap(2 * history[t - 53].numbers[1] ** 2 + 3 * history[t - 53].numbers[1] - 7),
        a14: this.wrap(-3 * history[t - 14].numbers[3] + 2 * Number(history[t - 1].No || 0) - 19),
        q49: this.wrap(-4 * history[t - 49].numbers[6] ** 2 + history[t - 49].numbers[6] + 20),
        q17: this.wrap(8 * history[t - 17].numbers[0] ** 2 - 7 * history[t - 17].numbers[0] + 18),
        dual: this.wrap(history[t - 22].numbers[5] + 2 * history[t - 34].numbers[5] + 47),
        tail: this.tailPick(history, t),
        gap: t < history.length ? Number(gapMap.get(key)) : nextGap,
        state: t < history.length ? Number(stateMap.get(key)) : nextState,
        cool1: cooldown[0],
        cool2: cooldown[1],
        cool3: cooldown[2],
      };
    }
    return matrix;
  }

  private cooldownPicks(history: DrawRow[], t: number, count: number) {
    const start = Math.max(0, t - 120);
    const sampleCount = t - start;
    const hits = Array(50).fill(0);
    for (let s = start; s < t; s++) for (const number of history[s].numbers) hits[number]++;
    const latest = new Set(history[t - 1]?.numbers || []);
    return Array.from({ length: 49 }, (_, index) => index + 1)
      .map((number) => ({
        number,
        risk: (hits[number] + 24 / 7) / (sampleCount + 24) + (latest.has(number) ? 0.006 : 0),
      }))
      .sort((a, b) => a.risk - b.risk || a.number - b.number)
      .slice(0, count)
      .map((item) => item.number);
  }

  private tailPick(history: DrawRow[], t: number) {
    const previous = history[t - 1];
    const periodTail = ((Number(previous.No || 0) % 10) + 10) % 10;
    if (new Set([0, 2, 3, 5, 6, 7]).has(periodTail)) {
      return this.wrap(4 * previous.numbers[6] - 2);
    }
    return this.wrap(-3 * history[t - 14].numbers[3] + 2 * Number(previous.No || 0) - 19);
  }

  private summarizeAdaptive(rows: any[], includeRows = false) {
    const issuedRows = rows.filter((row) => row.issued);
    const successCount = issuedRows.filter((row) => row.success).length;
    return {
      kind: 'strict-walk-forward-adaptive',
      periodCount: rows.length,
      issuedCount: issuedRows.length,
      skippedCount: rows.length - issuedRows.length,
      coverageRate: rows.length ? issuedRows.length / rows.length : 0,
      successCount,
      failureCount: issuedRows.length - successCount,
      successRate: issuedRows.length ? successCount / issuedRows.length : 0,
      averageIssuedCount: issuedRows.length
        ? issuedRows.reduce((sum, row) => sum + row.killNumbers.length, 0) / issuedRows.length
        : 0,
      modeCounts: rows.reduce((result, row) => {
        result[row.mode] = (result[row.mode] || 0) + 1;
        return result;
      }, {} as Record<string, number>),
      rows: includeRows ? rows.slice().reverse() : [],
      failureRows: includeRows ? issuedRows.filter((row) => !row.success).reverse() : [],
    };
  }

  private summarizeForcedFive(rows: any[]) {
    const validRows = rows.filter((row) => row.forcedFiveNumbers.length === 5);
    const successCount = validRows.filter((row) => row.forcedFiveSuccess).length;
    return {
      kind: 'strict-walk-forward-forced-five',
      count: validRows.length,
      successCount,
      failureCount: validRows.length - successCount,
      successRate: validRows.length ? successCount / validRows.length : 0,
      randomBaseline: this.theoreticalRate(5),
    };
  }

  private betaEstimate(successes: number, samples: number, strength: number, priorRate: number) {
    const alpha = successes + strength * priorRate;
    const beta = samples - successes + strength * (1 - priorRate);
    const total = alpha + beta;
    const mean = alpha / total;
    const sd = Math.sqrt((alpha * beta) / (total * total * (total + 1)));
    return { mean, lower: Math.max(0, mean - sd) };
  }

  private combinations<T>(items: T[], count: number) {
    const result: T[][] = [];
    const visit = (start: number, picked: T[]) => {
      if (picked.length === count) {
        result.push([...picked]);
        return;
      }
      for (let index = start; index <= items.length - (count - picked.length); index++) {
        picked.push(items[index]);
        visit(index + 1, picked);
        picked.pop();
      }
    };
    visit(0, []);
    return result;
  }

  private emptyOption(): SetOption {
    return {
      count: 0,
      numbers: [],
      numberValues: [],
      sourceLanes: [],
      familyCount: 0,
      estimatedRate: 0,
      conservativeRate: 0,
      longRate: 0,
      recentRate: 0,
      sampleCount: 0,
      randomBaseline: 0,
      liftOverRandom: 0,
    };
  }

  private theoreticalRate(killCount: number) {
    if (!killCount) return 0;
    return this.comb(49 - killCount, 7) / this.comb(49, 7);
  }

  private comb(n: number, k: number) {
    let value = 1;
    for (let index = 1; index <= k; index++) value = (value * (n - k + index)) / index;
    return value;
  }

  private isAtOrAfter(row: any, year: number, No: number) {
    return Number(row.year) > year || (Number(row.year) === year && Number(row.No) >= No);
  }

  private periodKey(year?: number, No?: number) {
    return `${Number(year || 0)}-${Number(No || 0)}`;
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
      .filter((row) => row.numbers.length === 7 && row.numbers.every((number) => number >= 1 && number <= 49))
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          a.id - b.id,
      );
  }
}

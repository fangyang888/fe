import { Injectable } from '@nestjs/common';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { HistoryService } from '../history/history.service';
import { ExperimentalKill98Service } from './experimental-kill98.service';
import { ExperimentalKill99Service } from './experimental-kill99.service';
import { ExperimentalGuardedKillService } from './experimental-guarded-kill.service';
import { GapScoreKillService } from './gap-score-kill.service';
import { FivePeriodKillService } from './five-period-kill.service';

interface DrawRow {
  id?: number;
  year?: number;
  No?: number;
  numbers: number[];
}

interface ComboCandidate {
  number: number;
  display: string;
  score: number;
  sources: string[];
  notes: string[];
  recent10: number;
  recent5: number;
  appearedLatest: boolean;
}

type SupplementPlanKey = 'short' | 'long' | 'observe' | 'consensus';

@Injectable()
export class KillComboSevenService {
  private readonly strictCachePath = join(tmpdir(), 'fe-kill-combo-seven-strict-cache.json');
  private strictCache:
    | {
        key: string;
        value: any;
      }
    | undefined;

  constructor(
    private readonly historyService: HistoryService,
    private readonly experimental98Service: ExperimentalKill98Service,
    private readonly experimental99Service: ExperimentalKill99Service,
    private readonly guardedService: ExperimentalGuardedKillService,
    private readonly gapScoreService: GapScoreKillService,
    private readonly fivePeriodKillService: FivePeriodKillService,
  ) {}

  async getComboSeven(count = 10) {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);
    const safeCount = Math.max(5, Math.min(20, Number(count) || 10));

    if (history.length < 140) {
      return {
        status: 'insufficient-history',
        message: '至少需要 140 期数据库 history 数据，才能做组合 7 杀滚动回测。',
        historyCount: history.length,
      };
    }

    const context = this.buildComboContext(rawRows);
    const current = this.buildSelection(rawRows, history, context);
    const backtest10 = this.buildBacktest(history, context, 10, 'consensus', true);
    const backtest20 = this.buildBacktest(history, context, 20, 'consensus', true);
    const requestedBacktest =
      safeCount === 10
        ? backtest10
        : this.buildBacktest(history, context, safeCount, 'consensus', true);
    const latest = history[history.length - 1];

    return {
      source: 'database:history',
      status: backtest10.successRate >= 0.8 ? 'strong' : backtest10.successRate >= 0.7 ? 'watch' : 'weak',
      currentRecommendation: current,
      backtest10,
      backtest20,
      requestedBacktest,
      supplementPlanBacktests: this.buildSupplementPlanBacktests(history, context),
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '组合 7 杀使用滚动口径：每一期只用该期之前的数据库数据生成候选，再检查 7 个杀码是否全部未开。',
      generatedAt: new Date().toISOString(),
    };
  }

  async getComboSevenStrict() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 150) {
      return {
        status: 'insufficient-history',
        message: '严格滚动回测至少需要 150 期数据库 history 数据。',
        historyCount: history.length,
      };
    }

    const latestForCache = history[history.length - 1];
    const cacheKey = [
      'v2',
      history.length,
      latestForCache.id,
      latestForCache.year,
      latestForCache.No,
      latestForCache.numbers.join('.'),
    ].join(':');
    if (this.strictCache?.key === cacheKey) {
      return {
        ...this.strictCache.value,
        cache: 'hit',
      };
    }
    try {
      const persistedCache = JSON.parse(await readFile(this.strictCachePath, 'utf8'));
      if (persistedCache?.key === cacheKey && persistedCache?.value) {
        this.strictCache = persistedCache;
        return {
          ...persistedCache.value,
          cache: 'disk-hit',
        };
      }
    } catch {
      // 缓存不存在或损坏时直接重新计算。
    }

    const currentContext = this.buildComboContext(rawRows);
    const current = this.buildSelection(rawRows, history, currentContext);
    const rowsByPlan: Record<SupplementPlanKey, any[]> = {
      short: [],
      long: [],
      observe: [],
      consensus: [],
    };
    const start = Math.max(140, history.length - 100);

    for (let t = start; t < history.length; t++) {
      const training = history.slice(0, t);
      const trainingRawRows = this.toRawRows(training);
      const rollingContext = this.buildComboContext(trainingRawRows);
      const selection = this.buildSelectionForHistory(training, rollingContext);
      const actual = history[t];

      for (const planKey of ['short', 'long', 'observe', 'consensus'] as SupplementPlanKey[]) {
        const plan =
          selection.supplementPlans.find((item) => item.key === planKey) ||
          selection.supplementPlans[0];
        const killNumbers = plan?.optimizedSeven || selection.optimizedSeven;
        const appearedNumbers = killNumbers
          .map((item) => item.number)
          .filter((number) => actual.numbers.includes(number));
        const coreAppearedNumbers = selection.coreNumbers
          .map((item) => item.number)
          .filter((number) => actual.numbers.includes(number));

        rowsByPlan[planKey].push({
          year: actual.year,
          No: actual.No,
          actualNumbers: actual.numbers,
          killNumbers,
          coreNumbers: selection.coreNumbers,
          appearedNumbers,
          coreAppearedNumbers,
          success: appearedNumbers.length === 0,
          coreSuccess: coreAppearedNumbers.length === 0,
          selectedStrategies: {
            exp98: rollingContext.best98Name,
            exp99: rollingContext.best99Name,
          },
        });
      }
    }

    const summarize = (rows: any[], count: number, includeRows = false) => {
      const selectedRows = rows.slice(-count);
      const successCount = selectedRows.filter((row) => row.success).length;
      const coreSuccessCount = selectedRows.filter((row) => row.coreSuccess).length;
      return {
        kind: 'strict-walk-forward-combo',
        count: selectedRows.length,
        successCount,
        failureCount: selectedRows.length - successCount,
        successRate: selectedRows.length ? successCount / selectedRows.length : 0,
        coreSuccessCount,
        coreSuccessRate: selectedRows.length ? coreSuccessCount / selectedRows.length : 0,
        failureGuard: this.buildFailureGuard(selectedRows),
        rows: includeRows ? selectedRows.slice().reverse() : [],
        failureRows: includeRows
          ? selectedRows.filter((row) => !row.success).reverse()
          : [],
      };
    };

    const backtest10 = summarize(rowsByPlan.consensus, 10, true);
    const backtest20 = summarize(rowsByPlan.consensus, 20, true);
    const supplementPlanBacktests: Record<string, any> = {};
    for (const planKey of ['short', 'long', 'observe', 'consensus'] as SupplementPlanKey[]) {
      supplementPlanBacktests[planKey] = {};
      for (const count of [10, 20, 50, 100]) {
        supplementPlanBacktests[planKey][`backtest${count}`] = summarize(
          rowsByPlan[planKey],
          count,
        );
      }
    }

    const latest = history[history.length - 1];
    const value = {
      source: 'database:history',
      mode: 'strict-rolling-strategy-selection',
      status:
        backtest10.successRate >= 0.8
          ? 'strong'
          : backtest10.successRate >= 0.7
            ? 'watch'
            : 'weak',
      currentRecommendation: current,
      backtest10,
      backtest20,
      requestedBacktest: backtest10,
      supplementPlanBacktests,
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '严格滚动口径：每一期只用该期之前的数据重新评估并选择 98/99 策略，再生成 7 个杀码。',
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };

    this.strictCache = { key: cacheKey, value };
    await writeFile(this.strictCachePath, JSON.stringify(this.strictCache), 'utf8').catch(() => {
      // 写缓存失败不影响接口结果。
    });
    return value;
  }

  async getStableFive() {
    const rawRows = await this.historyService.findAll();
    const history = this.normalizeRows(rawRows);

    if (history.length < 140) {
      return {
        status: 'insufficient-history',
        message: '至少需要 140 期数据库 history 数据，才能做稳健 5 杀滚动回测。',
        historyCount: history.length,
      };
    }

    const context = this.buildComboContext(rawRows);
    const current = this.buildStableFiveSelection(history, context);
    const rows = this.buildStableFiveRows(history, context, 100);
    const summaries: Record<string, any> = {};

    for (const count of [10, 20, 50, 100]) {
      summaries[`backtest${count}`] = this.summarizeStableFiveRows(rows.slice(-count), true);
    }

    const backtest10 = summaries.backtest10;
    const backtest20 = summaries.backtest20;
    const latest = history[history.length - 1];

    return {
      source: 'database:history',
      mode: 'stable-five-for-three-streak',
      status:
        backtest20.threeHitRate >= 0.45 && backtest20.successRate >= 0.75
          ? 'strong'
          : backtest20.successRate >= 0.65
            ? 'watch'
            : 'weak',
      currentRecommendation: current,
      backtest10,
      backtest20,
      backtest50: summaries.backtest50,
      backtest100: summaries.backtest100,
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '稳健 5 杀不是为了多杀码，而是降低错号暴露，重点观察三连窗口成功率和错号分布。',
      generatedAt: new Date().toISOString(),
    };
  }

  private buildComboContext(rawRows: any[]) {
    const exp98 = this.experimental98Service.buildComboReportFromRows(rawRows);
    const exp99 = this.experimental99Service.buildComboReportFromRows(rawRows);

    return {
      exp98,
      exp99,
      best98Key: exp98.best?.key || 'spanRange',
      best99Key: exp99.best?.key || 'pairAfter',
      best98Name: exp98.best?.name || '98优选',
      best99Name: exp99.best?.name || '99优选',
    };
  }

  private buildSupplementPlanBacktests(history: DrawRow[], context: any) {
    const plans: SupplementPlanKey[] = ['short', 'long', 'observe', 'consensus'];
    const counts = [10, 20, 50, 100];
    const result: Record<string, any> = {};
    const rowsByPlan: Record<SupplementPlanKey, any[]> = {
      short: [],
      long: [],
      observe: [],
      consensus: [],
    };
    const start = Math.max(140, history.length - 100);

    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const selection = this.buildSelectionForHistory(history.slice(0, t), context);

      for (const planKey of plans) {
        const plan = selection.supplementPlans.find((item) => item.key === planKey) || selection.supplementPlans[0];
        const killNumbers = plan?.optimizedSeven || selection.optimizedSeven;
        const appeared = killNumbers
          .map((item) => item.number)
          .filter((number) => actual.numbers.includes(number));

        rowsByPlan[planKey].push({
          year: actual.year,
          No: actual.No,
          success: appeared.length === 0,
        });
      }
    }

    for (const plan of plans) {
      result[plan] = {};
      for (const count of counts) {
        result[plan][`backtest${count}`] = this.toBacktestSummaryFromRows(rowsByPlan[plan].slice(-count));
      }
    }

    return result;
  }

  private toBacktestSummary(backtest: any) {
    return {
      count: backtest.count,
      successCount: backtest.successCount,
      failureCount: backtest.failureCount,
      successRate: backtest.successRate,
      failureGuard: backtest.failureGuard,
    };
  }

  private toBacktestSummaryFromRows(rows: Array<{ success: boolean; year?: number; No?: number }>) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      failureGuard: this.buildFailureGuard(rows),
    };
  }

  private buildStableFiveRows(history: DrawRow[], context: any, count: number) {
    const start = Math.max(140, history.length - count);
    const rows = [];

    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const selection = this.buildStableFiveSelection(history.slice(0, t), context);
      const appearedNumbers = selection.optimizedFive
        .map((item) => item.number)
        .filter((number) => actual.numbers.includes(number));

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        killNumbers: selection.optimizedFive,
        appearedNumbers,
        appearedCount: appearedNumbers.length,
        success: appearedNumbers.length === 0,
      });
    }

    return rows;
  }

  private summarizeStableFiveRows(rows: any[], includeRows = false) {
    const successCount = rows.filter((row) => row.success).length;
    const threeWindows = Math.max(0, rows.length - 2);
    let threeHitCount = 0;
    let maxSuccessStreak = 0;
    let run = 0;
    const appearedCountDistribution: Record<string, number> = {
      '0': 0,
      '1': 0,
      '2+': 0,
    };

    for (const row of rows) {
      if (row.success) {
        run += 1;
        maxSuccessStreak = Math.max(maxSuccessStreak, run);
      } else {
        run = 0;
      }

      if (row.appearedCount <= 0) appearedCountDistribution['0'] += 1;
      else if (row.appearedCount === 1) appearedCountDistribution['1'] += 1;
      else appearedCountDistribution['2+'] += 1;
    }

    for (let i = 0; i + 2 < rows.length; i++) {
      if (rows[i].success && rows[i + 1].success && rows[i + 2].success) {
        threeHitCount += 1;
      }
    }

    let currentSuccessStreak = 0;
    let currentFailureStreak = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].success) {
        if (currentFailureStreak > 0) break;
        currentSuccessStreak += 1;
      } else {
        if (currentSuccessStreak > 0) break;
        currentFailureStreak += 1;
      }
    }

    return {
      kind: 'stable-five-walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      threeWindows,
      threeHitCount,
      threeHitRate: threeWindows ? threeHitCount / threeWindows : 0,
      maxSuccessStreak,
      currentSuccessStreak,
      currentFailureStreak,
      appearedCountDistribution,
      rows: includeRows ? rows.slice().reverse() : [],
      failureRows: includeRows ? rows.filter((row) => !row.success).reverse() : [],
    };
  }

  private buildBacktest(
    history: DrawRow[],
    context: any,
    count: number,
    planKey: SupplementPlanKey,
    includeRows: boolean,
  ) {
    const start = Math.max(140, history.length - count);
    const rows = [];

    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const selection = this.buildSelectionForHistory(history.slice(0, t), context);
      const plan = selection.supplementPlans.find((item) => item.key === planKey) || selection.supplementPlans[0];
      const killNumbers = plan?.optimizedSeven || selection.optimizedSeven;
      const appeared = killNumbers
        .map((item) => item.number)
        .filter((number) => actual.numbers.includes(number));
      const coreAppeared = selection.coreNumbers
        .map((item) => item.number)
        .filter((number) => actual.numbers.includes(number));

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        killNumbers,
        coreNumbers: selection.coreNumbers,
        appearedNumbers: appeared,
        coreAppearedNumbers: coreAppeared,
        success: appeared.length === 0,
        coreSuccess: coreAppeared.length === 0,
      });
    }

    const successCount = rows.filter((row) => row.success).length;
    const coreSuccessCount = rows.filter((row) => row.coreSuccess).length;
    const failureGuard = this.buildFailureGuard(rows);

    return {
      kind: 'walk-forward-combo',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      coreSuccessCount,
      coreSuccessRate: rows.length ? coreSuccessCount / rows.length : 0,
      failureGuard,
      rows: includeRows ? rows.slice().reverse() : [],
      failureRows: includeRows ? rows.filter((row) => !row.success).reverse() : [],
    };
  }

  private buildReportRows(rawRows: any[]) {
    const exp98 = this.experimental98Service.buildComboReportFromRows(rawRows);
    const exp99 = this.experimental99Service.buildComboReportFromRows(rawRows);
    const guarded = this.guardedService.buildComboReportFromRows(rawRows);
    const gap = this.gapScoreService.buildComboReportFromRows(rawRows);

    return {
      exp98: exp98.best?.backtest20?.rows || [],
      exp99: exp99.best?.backtest20?.rows || [],
      guarded: guarded.best?.backtest20?.rows || [],
      gap: gap.backtest20?.rows || [],
      five: this.buildFiveStrictRows(rawRows, 20),
    };
  }

  private buildBacktestFromReportRows(reportRows: Record<string, any[]>, history: DrawRow[], count: number) {
    const start = Math.max(140, history.length - count);
    const rows = [];

    for (let t = start; t < history.length; t++) {
      const actual = history[t];
      const selection = this.buildSelectionFromReportRows(reportRows, actual, history.slice(0, t));
      const appeared = selection.optimizedSeven
        .map((item) => item.number)
        .filter((number) => actual.numbers.includes(number));
      const coreAppeared = selection.coreNumbers
        .map((item) => item.number)
        .filter((number) => actual.numbers.includes(number));

      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        killNumbers: selection.optimizedSeven,
        coreNumbers: selection.coreNumbers,
        appearedNumbers: appeared,
        coreAppearedNumbers: coreAppeared,
        success: appeared.length === 0,
        coreSuccess: coreAppeared.length === 0,
      });
    }

    const successCount = rows.filter((row) => row.success).length;
    const coreSuccessCount = rows.filter((row) => row.coreSuccess).length;
    const failureGuard = this.buildFailureGuard(rows);

    return {
      kind: 'walk-forward-combo',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      coreSuccessCount,
      coreSuccessRate: rows.length ? coreSuccessCount / rows.length : 0,
      failureGuard,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private buildFailureGuard(rows: Array<{ success: boolean; year?: number; No?: number }>) {
    const recentRows = rows.slice(-4);
    const failureCount = recentRows.filter((row) => !row.success).length;
    const recent10 = rows.slice(-10);
    const recent10FailureCount = recent10.filter((row) => !row.success).length;
    let consecutiveFailures = 0;
    for (let index = rows.length - 1; index >= 0 && !rows[index].success; index--) {
      consecutiveFailures++;
    }
    const isWarning = consecutiveFailures >= 2;
    const shouldSwitchExperiment =
      consecutiveFailures >= 3 ||
      (recent10.length >= 10 && recent10FailureCount >= 4);

    return {
      window: recentRows.length,
      failureCount,
      recent10FailureCount,
      consecutiveFailures,
      isWarning,
      shouldSwitchExperiment,
      periods: recentRows.map((row) => ({
        year: row.year,
        No: row.No,
        success: row.success,
      })),
      message: shouldSwitchExperiment
        ? `已连续错${consecutiveFailures}期或近10错${recent10FailureCount}期，达到切换条件，建议重新评估方案。`
        : isWarning
          ? `当前连续错${consecutiveFailures}期，仅作预警；未达到连续错3期或近10错4期的切换条件。`
          : `近10错${recent10FailureCount}期，方案暂时可继续观察。`,
    };
  }

  private buildSelectionFromReportRows(reportRows: Record<string, any[]>, actual: DrawRow, training: DrawRow[]) {
    const candidates = new Map<number, ComboCandidate>();
    const add = (number: number | undefined, source: string, score: number, note: string) => {
      if (!Number.isFinite(number) || !number) return;
      const existing = candidates.get(number);
      const recent10 = this.freqAt(training, number, 10);
      const recent5 = this.freqAt(training, number, 5);
      const appearedLatest = training[training.length - 1]?.numbers.includes(number) || false;
      const adjustedScore = score - recent10 * 6 - recent5 * 8 - (appearedLatest ? 6 : 0);

      if (existing) {
        existing.score += adjustedScore * 0.72;
        existing.sources.push(source);
        existing.notes.push(note);
        return;
      }

      candidates.set(number, {
        number,
        display: this.fmt(number),
        score: adjustedScore,
        sources: [source],
        notes: [note],
        recent10,
        recent5,
        appearedLatest,
      });
    };

    const findRow = (source: string) =>
      (reportRows[source] || []).find((row) => row.year === actual.year && row.No === actual.No);
    const exp98 = findRow('exp98');
    const exp99 = findRow('exp99');
    const guarded = findRow('guarded');
    const gap = findRow('gap');
    const five = findRow('five');

    add(exp98?.predictedNumber, '98 · 滚动优选', 12, '98页该期滚动推荐');
    add(exp99?.predictedNumber, '99 · 滚动优选', 12, '99页该期滚动推荐');
    add(guarded?.predictedNumber, 'guarded · 滚动优选', 12, '候选换位该期滚动推荐');
    add(gap?.predictedNumber, 'gap · 滚动优选', 8, 'gap该期滚动推荐');
    add(five?.predictedNumber, 'five-period · 严格', 5.5, '五期严格该期滚动补位');

    for (const item of guarded?.topCandidates || []) {
      add(item.number, `guarded · 候选第${item.rank}`, Math.max(2.8, 6.2 - item.rank * 0.45), 'guarded该期前五候选');
    }

    for (const item of gap?.topCandidates || []) {
      add(item.number, `gap · 候选第${item.rank}`, Math.max(2, 5.2 - item.rank * 0.45), 'gap该期前五候选');
    }

    const ranked = Array.from(candidates.values()).sort(
      (a, b) =>
        b.score - a.score ||
        a.recent10 - b.recent10 ||
        a.recent5 - b.recent5 ||
        a.number - b.number,
    );
    const coreNumbers = this.uniqueCandidates(
      [exp98?.predictedNumber, exp99?.predictedNumber, guarded?.predictedNumber, gap?.predictedNumber]
        .map((number) => number ? candidates.get(number) : undefined),
    );
    const supplements = this.buildMidTailCooldownSupplements(training, coreNumbers.map((item) => item.number), 3);
    const optimizedSeven = this.uniqueCandidates([...coreNumbers, ...supplements]);

    return {
      coreNumbers,
      optimizedSeven,
    };
  }

  private buildFiveStrictRows(rawRows: any[], count: number) {
    const history = this.normalizeRows(rawRows);
    const start = Math.max(5, history.length - count);
    const rows = [];

    for (let i = start; i < history.length; i++) {
      const trainingHistory = history.slice(0, i);
      const actual = history[i];
      const prediction = this.fivePeriodKillService.pickStrictForHistory(trainingHistory);
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction?.n ?? null,
        success: prediction ? !actual.numbers.includes(prediction.n) : false,
      });
    }

    return rows.reverse();
  }

  private buildSelection(rawRows: any[], history: DrawRow[], context: any) {
    const candidates = new Map<number, ComboCandidate>();
    const add = (number: number | undefined, source: string, score: number, note: string) => {
      if (!Number.isFinite(number) || !number) return;
      const existing = candidates.get(number);
      const recent10 = this.freqAt(history, number, 10);
      const recent5 = this.freqAt(history, number, 5);
      const appearedLatest = history[history.length - 1]?.numbers.includes(number) || false;
      const penalty = recent10 * 6 + recent5 * 8 + (appearedLatest ? 6 : 0);
      const adjustedScore = score - penalty;

      if (existing) {
        existing.score += adjustedScore * 0.72;
        existing.sources.push(source);
        existing.notes.push(note);
        return;
      }

      candidates.set(number, {
        number,
        display: this.fmt(number),
        score: adjustedScore,
        sources: [source],
        notes: [note],
        recent10,
        recent5,
        appearedLatest,
      });
    };

    const exp98 = context.exp98;
    const exp99 = context.exp99;
    const guarded = this.guardedService.buildComboReportFromRows(rawRows);
    const gap = this.gapScoreService.buildComboReportFromRows(rawRows);
    const strictFive = this.fivePeriodKillService.pickStrictForHistory(history);
    const mainFive = this.fivePeriodKillService.pickMainForHistory(history, 8);

    add(exp98.best?.prediction?.number, `98 · ${exp98.best?.name || '优选'}`, 12, '98页当前优选');
    add(exp99.best?.prediction?.number, `99 · ${exp99.best?.name || '优选'}`, 12, '99页当前优选');
    add(guarded.best?.prediction?.number, 'guarded · 增强候选换位', 12, '候选换位当前优选');
    add(gap.prediction?.number, 'gap-score', 8, '间隔序列当前优选');
    add(strictFive?.n, 'five-period · 严格', 5.5, '五期严格零失败补位');

    for (const strategy of (exp98.strategies || []) as any[]) {
      const rate20 = strategy.backtest20?.successRate || 0;
      const rate50 = strategy.backtest50?.successRate || 0;
      const blocked = strategy.failureGuard?.isBlocked;
      if (!blocked && rate20 >= 1 && rate50 >= 0.98) {
        add(strategy.prediction?.number, `98 · ${strategy.name}`, 5.8, '98页稳定子方向');
      }
    }

    for (const strategy of exp99.strategies || []) {
      const rate20 = strategy.backtest20?.successRate || 0;
      const rate50 = strategy.backtest50?.successRate || 0;
      if (rate20 >= 1 && rate50 >= 0.98) {
        add(strategy.prediction?.number, `99 · ${strategy.name}`, 5.8, '99页稳定子方向');
      }
    }

    for (const item of guarded.best?.prediction?.topCandidates || []) {
      add(item.number, `guarded · 候选第${item.rank}`, Math.max(2.8, 6.2 - item.rank * 0.45), 'guarded前五候选补位');
    }

    for (const item of gap.prediction?.topCandidates || []) {
      add(item.number, `gap · 候选第${item.rank}`, Math.max(2, 5.2 - item.rank * 0.45), 'gap前五候选补位');
    }

    if (mainFive) {
      add(mainFive.n, 'five-period · 主候选', 3.8, '五期样本匹配补位');
    }

    const ranked = Array.from(candidates.values()).sort(
      (a, b) =>
        b.score - a.score ||
        a.recent10 - b.recent10 ||
        a.recent5 - b.recent5 ||
        a.number - b.number,
    );

    const coreNumbers = this.uniqueCandidates([
      exp98.best?.prediction?.number,
      exp99.best?.prediction?.number,
      guarded.best?.prediction?.number,
      gap.prediction?.number,
    ].map((number) => number ? candidates.get(number) : undefined));
    const planSelection = this.buildSelectionForHistory(history, context);
    const supplements = planSelection.supplementPlans[0]?.supplements || [];
    const optimizedSeven = planSelection.optimizedSeven;

    return {
      key: 'combo-seven',
      name: '四页核心 + 中窗热尾补位',
      coreNumbers,
      optimizedSeven,
      supplementPlans: planSelection.supplementPlans,
      candidatePool: this.mergeCandidatePool([
        ...planSelection.supplementPlans.flatMap((plan: any) => plan.supplements || []),
        ...supplements,
        ...ranked,
      ]).slice(0, 18),
      sourceSummary: {
        exp98: this.toSourceSummary(exp98.best?.prediction?.number, exp98.best?.name),
        exp99: this.toSourceSummary(exp99.best?.prediction?.number, exp99.best?.name),
        guarded: this.toSourceSummary(guarded.best?.prediction?.number, guarded.best?.name),
        gap: this.toSourceSummary(gap.prediction?.number, gap.prediction?.strategyName),
        fiveStrict: this.toSourceSummary(strictFive?.n, '五期严格零失败'),
      },
    };
  }

  private buildSelectionForHistory(history: DrawRow[], context: any) {
    const exp98Best = this.pick98Strategy(history, context.best98Key);
    const exp99Best = this.pick99Strategy(history, context.best99Key);
    const guarded = this.pickGuarded(history);
    const gap = this.pickGap(history);

    const coreNumbers = this.uniqueCandidates([
      this.makeCandidate(exp98Best?.number, `98 · ${context.best98Name}`, '98页当前优选', history, 12),
      this.makeCandidate(exp99Best?.number, `99 · ${context.best99Name}`, '99页当前优选', history, 12),
      this.makeCandidate(guarded?.number, 'guarded · 增强候选换位', '候选换位当前优选', history, 12),
      this.makeCandidate(gap?.number, 'gap-score', '间隔序列当前优选', history, 8),
    ]);
    const coreValues = coreNumbers.map((item) => item.number);

    const shortSupplements = this.buildMidTailCooldownSupplements(history, coreValues, 3);
    const shortPlan = this.buildPlan(
      'short',
      '短线补位',
      '近10优先：中窗热尾降温补满 7 个，保留当前短线全中表现。',
      coreNumbers,
      shortSupplements,
      history,
    );

    const longBase = this.uniqueCandidates([
      this.makeCandidate(this.pick98Strategy(history, 'zoneDensity')?.number, '98 · 分区密度单杀', '长线保护补位', history, 5.8),
      this.makeCandidate(this.fivePeriodKillService.pickStrictForHistory(history)?.n, 'five-period · 严格', '五期严格零失败补位', history, 5.5),
    ]);
    const longPlan = this.buildPlan(
      'long',
      '长线保护',
      '近50/100优先：98分区密度 + five严格，再用中窗补满。',
      coreNumbers,
      longBase,
      history,
    );

    const observeBase = this.uniqueCandidates([
      this.makeCandidate(this.pick98Strategy(history, 'zoneDensity')?.number, '98 · 分区密度单杀', '观察补位', history, 5.8),
      this.makeCandidate(this.pick99Strategy(history, 'pairExact3')?.number, '99 · 精确三号重叠单杀', '观察补位', history, 5.8),
      this.makeCandidate(guarded?.topCandidates?.[2]?.number, 'guarded · 第3候选', '观察补位', history, 4.85),
    ]);
    const observePlan = this.buildPlan(
      'observe',
      '新实验观察',
      '新方向观察：98分区密度 + 99精确三号重叠 + guarded第3候选。',
      coreNumbers,
      observeBase,
      history,
    );
    const longValues = new Set(longPlan.optimizedSeven.map((item) => item.number));
    const sharedSupplements = observePlan.supplements.filter((item) => longValues.has(item.number));
    const consensusBase = this.uniqueCandidates([
      ...sharedSupplements,
      ...observePlan.supplements,
      ...longPlan.supplements,
    ]);
    const consensusPlan = this.buildPlan(
      'consensus',
      '长线 + 观察共识',
      '以长线保护和观察实验的共同号码优先，再按观察、长线顺序补满 7 个。',
      coreNumbers,
      consensusBase,
      history,
    );

    return {
      coreNumbers,
      optimizedSeven: consensusPlan.optimizedSeven,
      supplementPlans: [consensusPlan, longPlan, observePlan, shortPlan],
    };
  }

  private buildStableFiveSelection(history: DrawRow[], context: any) {
    const selection = this.buildSelectionForHistory(history, context);
    const scoreMap = new Map<
      number,
      ComboCandidate & { stableScore: number; planSupport: string[] }
    >();
    const addStable = (item: ComboCandidate | undefined, planName: string, weight: number) => {
      if (!item) return;
      const recentPenalty = item.recent10 * 1.4 + item.recent5 * 2.2 + (item.appearedLatest ? 2.4 : 0);
      const stableScore = weight + item.score * 0.18 - recentPenalty;
      const existing = scoreMap.get(item.number);

      if (existing) {
        existing.stableScore += stableScore;
        existing.planSupport.push(planName);
        existing.sources.push(...item.sources);
        existing.notes.push(...item.notes);
        return;
      }

      scoreMap.set(item.number, {
        ...item,
        stableScore,
        planSupport: [planName],
        sources: [...item.sources],
        notes: [...item.notes],
      });
    };

    for (const core of selection.coreNumbers) {
      addStable(core, '四页核心', 5.2);
    }

    const planWeights: Record<SupplementPlanKey, number> = {
      consensus: 4.4,
      long: 3.5,
      observe: 2.5,
      short: 1.4,
    };

    for (const plan of selection.supplementPlans) {
      const weight = planWeights[plan.key as SupplementPlanKey] || 1;
      for (const item of plan.optimizedSeven || []) {
        addStable(item, plan.name, weight);
      }
    }

    const ranked = Array.from(scoreMap.values()).sort(
      (a, b) =>
        b.planSupport.length - a.planSupport.length ||
        b.stableScore - a.stableScore ||
        a.recent10 - b.recent10 ||
        a.recent5 - b.recent5 ||
        a.number - b.number,
    );

    return {
      key: 'stable-five',
      name: '稳健 5 杀',
      optimizedFive: ranked.slice(0, 5),
      candidatePool: ranked.slice(0, 14),
      baseSeven: selection.optimizedSeven,
      planSnapshot: selection.supplementPlans,
      reason:
        '从 7 杀共识、长线保护、观察实验和四页核心里选重合度最高的 5 个；杀号数量减少，目标转向提升连续三期成功概率。',
    };
  }

  private buildPlan(
    key: SupplementPlanKey,
    name: string,
    description: string,
    coreNumbers: ComboCandidate[],
    supplements: ComboCandidate[],
    history: DrawRow[],
  ) {
    const coreValues = new Set(coreNumbers.map((item) => item.number));
    const uniqueSupplements = this.uniqueCandidates(supplements).filter(
      (item) => !coreValues.has(item.number),
    );
    const excluded = [...coreNumbers, ...uniqueSupplements].map((item) => item.number);
    const fillers = this.buildMidTailCooldownSupplements(
      history,
      excluded,
      Math.max(0, 7 - coreNumbers.length - uniqueSupplements.length),
    );
    const finalSupplements = this.uniqueCandidates([...uniqueSupplements, ...fillers]).slice(
      0,
      Math.max(0, 7 - coreNumbers.length),
    );
    const optimizedSeven = this.uniqueCandidates([...coreNumbers, ...finalSupplements]).slice(0, 7);

    return {
      key,
      name,
      description,
      supplements: finalSupplements,
      optimizedSeven,
    };
  }

  private makeCandidate(
    number: number | undefined,
    source: string,
    note: string,
    history: DrawRow[],
    score: number,
  ): ComboCandidate | undefined {
    if (!Number.isFinite(number) || !number) return undefined;
    return {
      number,
      display: this.fmt(number),
      score,
      sources: [source],
      notes: [note],
      recent10: this.freqAt(history, number, 10),
      recent5: this.freqAt(history, number, 5),
      appearedLatest: history[history.length - 1]?.numbers.includes(number) || false,
    };
  }

  private pick98Strategy(history: DrawRow[], key: string) {
    const service = this.experimental98Service as any;
    const strategy = (service.strategies || []).find((item: any) => item.key === key);
    return strategy ? service.pickByStrategy(history, history.length, strategy) : null;
  }

  private pick99Strategy(history: DrawRow[], key: string) {
    const service = this.experimental99Service as any;
    const strategy = (service.getStrategies?.() || []).find((item: any) => item.key === key);
    return strategy ? strategy.pick(history, history.length) : null;
  }

  private pickGuarded(history: DrawRow[]) {
    return (this.guardedService as any).pick(history, history.length, true);
  }

  private pickGap(history: DrawRow[]) {
    return (this.gapScoreService as any).pick(history, history.length);
  }

  private uniqueCandidates(items: Array<ComboCandidate | undefined>) {
    const seen = new Set<number>();
    return items.filter((item): item is ComboCandidate => {
      if (!item || seen.has(item.number)) return false;
      seen.add(item.number);
      return true;
    });
  }

  private mergeCandidatePool(items: ComboCandidate[]) {
    const merged = new Map<number, ComboCandidate>();
    for (const item of items) {
      const existing = merged.get(item.number);
      if (!existing) {
        merged.set(item.number, { ...item, sources: [...item.sources], notes: [...item.notes] });
        continue;
      }
      existing.score = Math.max(existing.score, item.score);
      existing.sources.push(...item.sources);
      existing.notes.push(...item.notes);
    }
    return Array.from(merged.values()).sort(
      (a, b) =>
        b.score - a.score ||
        a.recent10 - b.recent10 ||
        a.recent5 - b.recent5 ||
        a.number - b.number,
    );
  }

  private buildMidTailCooldownSupplements(history: DrawRow[], excluded: number[], limit: number) {
    const excludedSet = new Set(excluded);
    const last = history[history.length - 1];
    const lastNumbers = new Set(last?.numbers || []);
    const recent10 = history.slice(-10).flatMap((row) => row.numbers);

    return Array.from({ length: 49 }, (_, index) => index + 1)
      .filter((number) => !excludedSet.has(number))
      .map((number): ComboCandidate => {
        const recent10Count = this.freqAt(history, number, 10);
        const recent5Count = this.freqAt(history, number, 5);
        const appearedLatest = lastNumbers.has(number);
        const tailPressure = recent10.filter((item) => item % 10 === number % 10).length;
        const score = recent10Count * 4 - recent5Count * 4 - (appearedLatest ? 4 : 0) + tailPressure;

        return {
          number,
          display: this.fmt(number),
          score,
          sources: ['中窗热尾降温补位'],
          notes: ['近10有热度、近5降温、尾数压力仍在'],
          recent10: recent10Count,
          recent5: recent5Count,
          appearedLatest,
        };
      })
      .sort((a, b) => b.score - a.score || a.number - b.number)
      .slice(0, limit);
  }

  private toSourceSummary(number?: number, name?: string) {
    return {
      number: number || null,
      display: number ? this.fmt(number) : '--',
      name: name || '--',
    };
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 49);
        return { id: Number(row.id || 0), year: row.year, No: row.No, numbers };
      })
      .filter((row) => row.numbers.length === 7)
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          (a.id || 0) - (b.id || 0),
      );
  }

  private toRawRows(history: DrawRow[]) {
    return history.map((row) => ({
      id: row.id,
      year: row.year,
      No: row.No,
      n1: row.numbers[0],
      n2: row.numbers[1],
      n3: row.numbers[2],
      n4: row.numbers[3],
      n5: row.numbers[4],
      n6: row.numbers[5],
      n7: row.numbers[6],
    }));
  }

  private freqAt(history: DrawRow[], n: number, window: number) {
    let count = 0;
    for (let i = Math.max(0, history.length - window); i < history.length; i++) {
      if (history[i].numbers.includes(n)) count++;
    }
    return count;
  }

  private fmt(n: number) {
    return String(n).padStart(2, '0');
  }
}

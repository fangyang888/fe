import { Injectable } from '@nestjs/common';
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

@Injectable()
export class KillComboSevenService {
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

    const current = this.buildSelection(rawRows, history);
    const reportRows = this.buildReportRows(rawRows);
    const backtest10 = this.buildBacktestFromReportRows(reportRows, history, 10);
    const backtest20 = this.buildBacktestFromReportRows(reportRows, history, 20);
    const requestedBacktest =
      safeCount === 10 ? backtest10 : this.buildBacktestFromReportRows(reportRows, history, safeCount);
    const latest = history[history.length - 1];

    return {
      source: 'database:history',
      status: backtest10.successRate >= 0.8 ? 'strong' : backtest10.successRate >= 0.7 ? 'watch' : 'weak',
      currentRecommendation: current,
      backtest10,
      backtest20,
      requestedBacktest,
      historyMeta: {
        count: history.length,
        latest,
      },
      note:
        '组合 7 杀使用滚动口径：每一期只用该期之前的数据库数据生成候选，再检查 7 个杀码是否全部未开。',
      generatedAt: new Date().toISOString(),
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

    return {
      kind: 'walk-forward-combo',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      coreSuccessCount,
      coreSuccessRate: rows.length ? coreSuccessCount / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
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

    return {
      coreNumbers,
      optimizedSeven: coreNumbers,
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

  private buildSelection(rawRows: any[], history: DrawRow[]) {
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

    const exp98 = this.experimental98Service.buildComboReportFromRows(rawRows);
    const exp99 = this.experimental99Service.buildComboReportFromRows(rawRows);
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

    return {
      key: 'combo-seven',
      name: '四页核心组合',
      coreNumbers,
      optimizedSeven: coreNumbers,
      candidatePool: ranked.slice(0, 18),
      sourceSummary: {
        exp98: this.toSourceSummary(exp98.best?.prediction?.number, exp98.best?.name),
        exp99: this.toSourceSummary(exp99.best?.prediction?.number, exp99.best?.name),
        guarded: this.toSourceSummary(guarded.best?.prediction?.number, guarded.best?.name),
        gap: this.toSourceSummary(gap.prediction?.number, gap.prediction?.strategyName),
        fiveStrict: this.toSourceSummary(strictFive?.n, '五期严格零失败'),
      },
    };
  }

  private uniqueCandidates(items: Array<ComboCandidate | undefined>) {
    const seen = new Set<number>();
    return items.filter((item): item is ComboCandidate => {
      if (!item || seen.has(item.number)) return false;
      seen.add(item.number);
      return true;
    });
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

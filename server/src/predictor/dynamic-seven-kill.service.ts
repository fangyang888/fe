// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { FixedHybridKillService } from './fixed-hybrid-kill.service';
import { FivePeriodKillService } from './five-period-kill.service';
import { ExperimentalKill98Service } from './experimental-kill98.service';
import { ExperimentalKill99Service } from './experimental-kill99.service';
import { ExperimentalGuardedKillService } from './experimental-guarded-kill.service';
import { GapScoreKillService } from './gap-score-kill.service';

interface LanePick {
  lane: string;
  family: string;
  name: string;
  number: number;
}

@Injectable()
export class DynamicSevenKillService {
  private cache?: { key: string; value: any };
  private inFlight?: Promise<any>;

  constructor(
    private readonly historyService: HistoryService,
    private readonly fixedHybridKillService: FixedHybridKillService,
    private readonly fivePeriodKillService: FivePeriodKillService,
    private readonly experimental98Service: ExperimentalKill98Service,
    private readonly experimental99Service: ExperimentalKill99Service,
    private readonly guardedService: ExperimentalGuardedKillService,
    private readonly gapScoreService: GapScoreKillService,
  ) {}

  async getDynamicSeven() {
    const rawRows = await this.historyService.findAll();
    if (rawRows.length < 250) {
      return {
        status: 'insufficient-history',
        message: '动态学习7杀至少需要250期数据库历史。',
        historyCount: rawRows.length,
      };
    }
    const latest = rawRows[rawRows.length - 1];
    const key = `dynamic-v1:${rawRows.length}:${latest?.id || ''}`;
    if (this.cache?.key === key) return { ...this.cache.value, cache: 'hit' };
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.buildResponse(rawRows, key).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async buildResponse(rawRows: any[], key: string) {
    const rows = rawRows.map((row) => ({
      id: Number(row.id || 0), year: row.year, No: row.No,
      numbers: [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6,row.n7].map(Number),
    }));
    const matrix = rows.map((row) => row.numbers);
    const h98 = this.experimental98Service['normalizeRows'](rawRows);
    const h99 = this.experimental99Service['normalizeRows'](rawRows);
    const guardedHistory = this.guardedService['normalizeRows'](rawRows);
    const gapHistory = this.gapScoreService['normalizeRows'](rawRows);
    const strategies98 = this.experimental98Service['strategies'];
    const strategies99 = this.experimental99Service['getStrategies']();

    const picksAt = (t: number): LanePick[] => {
      const picks: LanePick[] = [];
      const add = (lane: string, family: string, name: string, number: any) => {
        if (Number.isFinite(number) && number >= 1 && number <= 49) {
          picks.push({ lane, family, name, number });
        }
      };
      const h47 = this.fixedHybridKillService.getProbability47PredictionsForMatrix(matrix.slice(0, t));
      h47.slice(7, 10).forEach((item: any, index: number) =>
        add(`h47-${index + 8}`, 'h47', `h47第${index + 8}位`, item?.n));
      const training = rows.slice(0, t);
      add('five-strict', 'five-period', '五期严格候选', this.fivePeriodKillService.pickStrictForHistory(training)?.n);
      add('five-main', 'five-period', '五期主候选', this.fivePeriodKillService.pickMainForHistory(training, 8)?.n);
      for (const strategy of strategies98) {
        add(`98-${strategy.key}`, 'experimental-98', strategy.name,
          this.experimental98Service['pickByStrategy'](h98, t, strategy)?.number);
      }
      for (const strategy of strategies99) {
        add(`99-${strategy.key}`, 'experimental-99', strategy.name, strategy.pick(h99, t)?.number);
      }
      const base = this.guardedService['pick'](guardedHistory, t, false);
      const enhanced = this.guardedService['pick'](guardedHistory, t, true);
      add('guarded-base', 'experimental-guarded', '原始候选换位', base?.number);
      add('guarded-enhanced', 'experimental-guarded', '增强候选换位', enhanced?.number);
      const gap = this.gapScoreService['pick'](gapHistory, t);
      add('gap-main', 'gap-score', 'Gap主候选', gap?.number);
      return picks;
    };

    const start = Math.max(180, rows.length - 150);
    const records: any[] = [];
    for (let t = start; t < rows.length; t++) {
      const actual = rows[t].numbers;
      records.push({
        t, year: rows[t].year, No: rows[t].No, actual,
        picks: picksAt(t).map((pick) => ({ ...pick, success: !actual.includes(pick.number) })),
      });
    }

    const buildLaneStats = (beforeIndex: number) => {
      const past = records.slice(Math.max(0, beforeIndex - 50), beforeIndex);
      const stats = new Map<string, any>();
      for (const record of past) for (const pick of record.picks) {
        const item = stats.get(pick.lane) || {
          lane: pick.lane, family: pick.family, name: pick.name, outcomes: [],
        };
        item.outcomes.push(pick.success);
        stats.set(pick.lane, item);
      }
      for (const item of stats.values()) {
        const last50 = item.outcomes.slice(-50);
        const last20 = last50.slice(-20);
        item.count20 = last20.length;
        item.success20 = last20.filter(Boolean).length;
        item.rate20 = item.success20 / Math.max(1, item.count20);
        item.count50 = last50.length;
        item.success50 = last50.filter(Boolean).length;
        item.rate50 = item.success50 / Math.max(1, item.count50);
        item.score = item.rate50 * 0.7 + item.rate20 * 0.3;
      }
      return { stats, past };
    };

    const pairFailureRate = (laneA: string, laneB: string, past: any[]) => {
      let bothFailed = 0;
      let count = 0;
      for (const record of past) {
        const a = record.picks.find((pick) => pick.lane === laneA);
        const b = record.picks.find((pick) => pick.lane === laneB);
        if (!a || !b) continue;
        count++;
        if (!a.success && !b.success) bothFailed++;
      }
      return count ? bothFailed / count : 0;
    };

    const select = (picks: LanePick[], beforeIndex: number, t: number) => {
      const { stats, past } = buildLaneStats(beforeIndex);
      const byNumber = new Map<number, any>();
      for (const pick of picks) {
        const stat = stats.get(pick.lane);
        if (!stat || stat.count50 < 20) continue;
        const item = byNumber.get(pick.number) || { number: pick.number, sources: [] };
        item.sources.push({ ...pick, ...stat });
        byNumber.set(pick.number, item);
      }
      const latestNumbers = new Set(rows[t - 1]?.numbers || []);
      const recent10 = rows.slice(Math.max(0, t - 10), t);
      const pool = [...byNumber.values()].map((item) => {
        item.sources.sort((a, b) => b.score - a.score);
        const frequency10 = recent10.filter((row) => row.numbers.includes(item.number)).length;
        const consensusBonus = Math.min(0.08, Math.max(0, item.sources.length - 1) * 0.02);
        const heatPenalty = frequency10 * 0.008 + (latestNumbers.has(item.number) ? 0.015 : 0);
        return {
          ...item,
          bestLane: item.sources[0].lane,
          baseScore: item.sources[0].score + consensusBonus - heatPenalty,
          frequency10,
          consensusCount: item.sources.length,
        };
      });
      const selected: any[] = [];
      while (selected.length < 7 && pool.length) {
        let bestIndex = 0;
        let bestAdjusted = -Infinity;
        for (let index = 0; index < pool.length; index++) {
          const candidate = pool[index];
          const jointRisk = selected.length
            ? selected.reduce((sum, chosen) =>
                sum + pairFailureRate(candidate.bestLane, chosen.bestLane, past), 0) / selected.length
            : 0;
          const adjustedScore = candidate.baseScore - jointRisk * 0.18;
          if (adjustedScore > bestAdjusted) {
            bestAdjusted = adjustedScore;
            bestIndex = index;
          }
        }
        const [chosen] = pool.splice(bestIndex, 1);
        selected.push({ ...chosen, score: Number(bestAdjusted.toFixed(4)) });
      }
      return selected.map((item, index) => ({
        ...item,
        role: index < 4 ? 'core' : 'dynamic',
        display: String(item.number).padStart(2, '0'),
        sources: item.sources.map((source) => ({
          lane: source.lane, family: source.family, name: source.name,
          rate20: source.rate20, success20: source.success20, count20: source.count20,
          rate50: source.rate50, success50: source.success50, count50: source.count50,
        })),
      }));
    };

    const comboRows: any[] = [];
    for (let index = 50; index < records.length; index++) {
      const selection = select(records[index].picks, index, records[index].t);
      const appearedNumbers = selection
        .map((item) => item.number)
        .filter((number) => records[index].actual.includes(number));
      comboRows.push({
        year: records[index].year, No: records[index].No,
        actualNumbers: records[index].actual,
        killNumbers: selection.map((item) => item.number),
        appearedNumbers,
        success: appearedNumbers.length === 0,
      });
    }
    const current = select(picksAt(rows.length), records.length, rows.length);
    const summarize = (count: number, includeRows = false) => {
      const selectedRows = comboRows.slice(-count);
      const successCount = selectedRows.filter((row) => row.success).length;
      return {
        kind: 'strict-online-walk-forward', count: selectedRows.length,
        successCount, failureCount: selectedRows.length - successCount,
        successRate: successCount / Math.max(1, selectedRows.length),
        rows: includeRows ? selectedRows.slice().reverse() : [],
        failureRows: selectedRows.filter((row) => !row.success).slice().reverse(),
      };
    };
    const backtest20 = summarize(20, true);
    const backtest50 = summarize(50);
    const backtest100 = summarize(100);
    const estimatedRate = current.reduce((probability, item) => {
      const best = item.sources[0];
      return probability * (best?.rate50 || 0);
    }, 1);
    const confidence = backtest20.successRate >= 0.65 && backtest50.successRate >= 0.6
      ? 'strong' : backtest20.successRate >= 0.5 && backtest50.successRate >= 0.5 ? 'watch' : 'weak';
    const value = {
      source: 'database:history', status: 'ready', confidence,
      currentRecommendation: {
        numbers: current,
        coreNumbers: current.slice(0, 4),
        dynamicNumbers: current.slice(4),
        estimatedIndependentRate: estimatedRate,
        action: confidence === 'strong' ? 'output-seven' : confidence === 'watch' ? 'core-plus-observe' : 'skip',
      },
      backtest20, backtest50, backtest100,
      historyMeta: {
        count: rows.length,
        latest: rows[rows.length - 1],
      },
      method: {
        name: '动态4+3在线学习',
        sourcePages: ['/kill/h47','/kill/five-period','/kill/experimental-98','/kill/experimental-99','/kill/experimental-guarded','/kill/gap-score'],
        statement: '每一期只使用此前20/50期表现更新权重；加入多源共识、近期热度和共同失败惩罚。未读取 /kill/combo-seven。',
      },
      generatedAt: new Date().toISOString(), cache: 'miss',
    };
    this.cache = { key, value };
    return value;
  }
}

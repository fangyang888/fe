import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { HistoryService } from '../history/history.service';
import {
  computeOnlineRisk,
  RiskAuditRow,
  RiskDraw,
  RISK_FEATURES,
} from './online-risk-ranking.model';

function summarize(rows: RiskAuditRow[]) {
  const successCount = rows.filter((r) => r.success).length;
  const specialCodeMissCount = rows.filter((r) => r.specialCodeMiss).length;
  return {
    count: rows.length,
    successCount,
    failureCount: rows.length - successCount,
    successRate: rows.length ? successCount / rows.length : null,
    specialCodeMissCount,
    specialCodeMissRate: rows.length
      ? specialCodeMissCount / rows.length
      : null,
  };
}

@Injectable()
export class OnlineRiskRankingService {
  private cache: {
    key: string;
    value: ReturnType<OnlineRiskRankingService['buildReport']>;
  } | null = null;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const records = await this.historyService.findAll(2026);
    const history: RiskDraw[] = records
      .filter((r) => Number(r.year) === 2026)
      .map((r) => ({
        year: 2026,
        No: Number(r.No),
        numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number),
      }))
      .sort((a, b) => a.No - b.No);
    const key = createHash('sha256')
      .update(JSON.stringify(history))
      .digest('hex');
    if (this.cache?.key === key) return this.cache.value;
    const value = this.buildReport(history, key);
    this.cache = { key, value };
    return value;
  }

  private buildReport(history: RiskDraw[], sourceHash: string) {
    const common = {
      year: 2026,
      historyCount: history.length,
      sourceHash,
      generatedAt: new Date().toISOString(),
    };
    const seen = new Set<number>();
    const invalid = history.filter((r) => {
      const duplicate = seen.has(r.No);
      seen.add(r.No);
      return (
        duplicate ||
        !Number.isInteger(r.No) ||
        r.No < 1 ||
        r.No > 365 ||
        new Set(r.numbers).size !== 7 ||
        r.numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 49)
      );
    });
    const lastNo = history.at(-1)?.No ?? 0;
    const missing = Array.from(
      { length: Math.min(Math.max(lastNo, 0), 365) },
      (_, i) => i + 1,
    ).filter((n) => !seen.has(n));
    if (invalid.length || missing.length)
      return {
        ...common,
        status: 'invalid-history' as const,
        message:
          '2026 年数据存在缺期、重复期号或无效号码，补齐后才能按原模型计算。',
        integrity: {
          complete: false,
          missing,
          invalidPeriods: invalid.map((r) => r.No),
        },
      };
    if (history.length < 40)
      return {
        ...common,
        status: 'insufficient-history' as const,
        message: `需要从第 1 期起连续至少 40 期的 2026 年数据，当前 ${history.length} 期。`,
      };
    const result = computeOnlineRisk(history);
    const auditRows = result.rows.filter((r) => r.No >= 151 && r.No <= 250);
    const after250 = result.rows.filter((r) => r.No >= 251);
    const earlierWeights =
      result.weightHistory.find((r) => r.afterNo === Math.max(40, lastNo - 20))
        ?.weights ?? RISK_FEATURES.map(() => 0);
    return {
      ...common,
      status: 'ready' as const,
      latest: history[history.length - 1],
      target: lastNo < 365 ? { year: 2026, No: lastNo + 1 } : null,
      integrity: { complete: true },
      model: {
        version: 'online-ranking-2026-v1',
        name: '动态号码排序',
        learningRate: 0.03,
        retention: 0.97,
        trainingStart: 41,
        description:
          '每期开奖后学习号码的相对出现倾向；每期只排除分数最低的一个号码。',
      },
      prediction: lastNo < 365 ? result.prediction : null,
      rolling: [10, 20, 50, 100, 200].map((window) => ({
        window,
        ...summarize(result.rows.slice(-window)),
      })),
      stages: {
        selection: summarize(
          result.rows.filter((r) => r.No >= 101 && r.No <= 150),
        ),
        audit: {
          ...summarize(auditRows),
          complete: auditRows.length === 100,
          targetPassed:
            auditRows.length === 100 &&
            auditRows.filter((r) => r.success).length >= 95,
        },
        after250: summarize(after250),
      },
      weights: RISK_FEATURES.map((name, k) => ({
        name,
        current: result.weightHistory.at(-1)?.weights[k] ?? 0,
        previous: earlierWeights[k],
      })),
      rows: result.rows.slice().reverse(),
      notice:
        '历史数据已用于多轮研究，以下是逐期回溯结果。250期后记录为固定规则回算，不等于已提前登记的预测。模型分数和回测成功率都不是下一期的成功概率。',
    };
  }
}

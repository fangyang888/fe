import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { HistoryService } from '../history/history.service';

type BallColor = '红' | '蓝' | '绿' | null;
type Draw = {
  year: number;
  No: number;
  numbers: number[];
  colors: BallColor[];
};
type AuditRow = Draw & {
  source: Draw;
  predictedNumber: number;
  predictedColor: BallColor;
  success: boolean;
  specialCodeMiss: boolean;
};

function summarize(rows: AuditRow[]) {
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
export class PreviousFourthService {
  private cache: {
    key: string;
    value: ReturnType<PreviousFourthService['report']>;
  } | null = null;
  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const records = await this.historyService.findAll(2026);
    const history: Draw[] = records
      .filter((r) => Number(r.year) === 2026)
      .map((r) => {
        const numbers = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number);
        const colors: BallColor[] = numbers.map((n) => {
          const color = r.numberInfos?.find(
            (info) => Number(info.number) === n,
          )?.color;
          return color === '红' || color === '蓝' || color === '绿'
            ? color
            : null;
        });
        return { year: 2026, No: Number(r.No), numbers, colors };
      })
      .sort((a, b) => a.No - b.No);
    const key = createHash('sha256')
      .update(JSON.stringify(history))
      .digest('hex');
    if (this.cache?.key === key) return this.cache.value;
    const value = this.report(history, key);
    this.cache = { key, value };
    return value;
  }

  private report(history: Draw[], sourceHash: string) {
    const common = {
      year: 2026,
      historyCount: history.length,
      sourceHash,
      generatedAt: new Date().toISOString(),
    };
    const seen = new Set<number>();
    const invalidPeriods: number[] = [];
    for (const r of history) {
      if (
        seen.has(r.No) ||
        !Number.isInteger(r.No) ||
        r.No < 1 ||
        r.No > 365 ||
        new Set(r.numbers).size !== 7 ||
        r.numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 49)
      )
        invalidPeriods.push(r.No);
      seen.add(r.No);
    }
    const latest = history[history.length - 1];
    const lastNo = latest?.No ?? 0;
    const missing = Array.from(
      { length: Math.min(365, Math.max(0, lastNo)) },
      (_, i) => i + 1,
    ).filter((n) => !seen.has(n));
    if (missing.length || invalidPeriods.length)
      return {
        ...common,
        status: 'invalid-history' as const,
        message: '2026 年历史存在缺期、重复期号或无效号码，请先修复数据。',
        integrity: { missing, invalidPeriods },
      };
    if (!latest)
      return {
        ...common,
        status: 'insufficient-history' as const,
        message: '暂无2026年历史记录，至少需要1期数据才能生成下一期候选。',
      };

    const rows: AuditRow[] = history.slice(1).map((r, i) => {
      const source = history[i];
      const predictedNumber = source.numbers[3];
      return {
        ...r,
        source,
        predictedNumber,
        predictedColor: source.colors[3],
        success: !r.numbers.includes(predictedNumber),
        specialCodeMiss: r.numbers[6] !== predictedNumber,
      };
    });
    const audit = rows.filter((r) => r.No >= 151 && r.No <= 250);
    return {
      ...common,
      status: 'ready' as const,
      latest,
      target: lastNo < 365 ? { year: 2026, No: lastNo + 1 } : null,
      prediction:
        lastNo < 365
          ? {
              number: latest.numbers[3],
              color: latest.colors[3],
              position: 4,
              source: { year: 2026, No: lastNo },
            }
          : null,
      model: {
        version: 'previous-fourth-2026-v1',
        name: '上期第4位排除',
        rule: '读取上期接口原始顺序的第4个号码，作为下一期唯一排除号；不对7球按大小排序。',
      },
      rolling: [10, 20, 50, 100, 200].map((window) => ({
        window,
        ...summarize(rows.slice(-window)),
      })),
      stages: {
        selection: summarize(rows.filter((r) => r.No >= 101 && r.No <= 150)),
        audit: {
          ...summarize(audit),
          complete: audit.length === 100,
          targetPassed:
            audit.length === 100 && audit.filter((r) => r.success).length >= 95,
        },
        after250: summarize(rows.filter((r) => r.No >= 251)),
      },
      rows: rows.slice().reverse(),
      notice:
        '成功表示排除号未出现在下一期全部7球中。历史数据已用于多轮研究，以上为回溯统计；251期后的数据也按当前历史回算，不等于逐期提前登记的预测。历史成功率不是下一期成功概率。',
    };
  }
}

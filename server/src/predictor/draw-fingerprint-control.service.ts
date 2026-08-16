import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
};

@Injectable()
export class DrawFingerprintControlService {
  private readonly salt = 2_199_518;
  private readonly searchedCandidateCount = 5_000_000;
  private readonly frozenYear = 2026;
  private readonly frozenNo = 198;
  private readonly prospectiveStartNo = 199;

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 501) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: '开奖号指纹对照至少需要501期历史，才能展示完整500期回测。',
      };
    }

    const rows = this.buildRows(history);
    const frozenRows = rows.filter((row) => this.atOrBeforeFreeze(row));
    const prospectiveRows = rows.filter(
      (row) =>
        Number(row.year) > this.frozenYear ||
        (Number(row.year) === this.frozenYear &&
          Number(row.No) >= this.prospectiveStartNo),
    );
    const latest = history[history.length - 1];
    const prediction = this.pick(
      latest,
      latest.year,
      Number(latest.No || 0) + 1,
    );

    return {
      status: 'control-observation',
      strategy: {
        key: 'drawFingerprintHashControl',
        name: '上一期开奖指纹哈希对照',
        formula:
          'mix32(FNV1a(上期7个位置号) XOR 2,199,518) mod 49 + 1',
        salt: this.salt,
        searchedCandidateCount: this.searchedCandidateCount,
        frozenAt: { year: this.frozenYear, No: this.frozenNo },
        prospectiveStart: {
          year: this.frozenYear,
          No: this.prospectiveStartNo,
        },
        description:
          '把上一期7个位置号压成32位指纹，再与冻结盐值混合并映射到1～49。该算法用于检验参数海选能否制造高回测，不应解释为开奖规律。',
        warning:
          '盐值从500万个候选中按历史成绩筛出，存在明确的多重比较偏差；只有冻结后的真实前瞻记录具有验证价值。',
      },
      prediction,
      frozenBacktests: this.summarizeWindows(frozenRows),
      rollingBacktests: this.summarizeWindows(rows),
      validation: {
        ...this.summarize(prospectiveRows),
        kind: 'prospective-frozen',
        start: { year: this.frozenYear, No: this.prospectiveStartNo },
        message: prospectiveRows.length
          ? `已累计${prospectiveRows.length}期冻结后结果。`
          : '等待2026年第199期及以后开奖结果。',
      },
      offlineAudit: {
        kind: 'earlier-train-later-test',
        selectedCandidateCount: 20,
        trainThreshold: 0.95,
        testCountPerCandidate: 200,
        meanTestRate: 0.8538,
        minTestRate: 0.775,
        maxTestRate: 0.89,
        randomBaseline: 42 / 49,
        description:
          '在更早200期筛出20个训练成绩不低于95%的盐值，再测试随后200期；平均成绩回落至85.38%。',
      },
      historyMeta: { count: history.length, latest },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildRows(history: DrawRow[]) {
    const rows = [];
    for (let t = 1; t < history.length; t++) {
      const actual = history[t];
      const prediction = this.pick(
        history[t - 1],
        actual.year,
        actual.No,
      );
      rows.push({
        year: actual.year,
        No: actual.No,
        actualNumbers: actual.numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        source: prediction.source,
        sourceSignature: prediction.sourceSignature,
        mixedValue: prediction.mixedValue,
        success: !actual.numbers.includes(prediction.number),
      });
    }
    return rows;
  }

  private pick(source: DrawRow, targetYear?: number, targetNo?: number) {
    const sourceSignature = this.signature(source.numbers);
    const mixedValue = this.mix32((sourceSignature ^ this.salt) >>> 0);
    const number = (mixedValue % 49) + 1;
    return {
      number,
      display: String(number).padStart(2, '0'),
      target: { year: targetYear, No: targetNo },
      source: {
        id: source.id,
        year: source.year,
        No: source.No,
        numbers: source.numbers,
      },
      sourceSignature,
      sourceSignatureHex: `0x${sourceSignature.toString(16).padStart(8, '0')}`,
      mixedValue,
      mixedValueHex: `0x${mixedValue.toString(16).padStart(8, '0')}`,
      salt: this.salt,
      formula: `${mixedValue} mod 49 + 1 = ${number}`,
      reason: `将上一期${source.year || '--'}-${String(source.No || '--').padStart(3, '0')}的7个位置号生成固定指纹，与冻结盐值混合后映射得到 ${String(number).padStart(2, '0')}。`,
    };
  }

  private signature(numbers: number[]) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < numbers.length; index++) {
      hash ^= numbers[index] + index * 53;
      hash = Math.imul(hash, 0x01000193);
    }
    return this.mix32(hash >>> 0);
  }

  private mix32(value: number) {
    let mixed = value >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
  }

  private summarizeWindows(rows: any[]) {
    return {
      backtest20: this.summarize(rows.slice(-20)),
      backtest50: this.summarize(rows.slice(-50)),
      backtest100: this.summarize(rows.slice(-100)),
      backtest200: this.summarize(rows.slice(-200)),
      backtest500: this.summarize(rows.slice(-500)),
    };
  }

  private summarize(rows: any[]) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private atOrBeforeFreeze(row: { year?: number; No?: number }) {
    return (
      Number(row.year) < this.frozenYear ||
      (Number(row.year) === this.frozenYear &&
        Number(row.No) <= this.frozenNo)
    );
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => ({
        id: Number(row.id || 0),
        year: row.year,
        No: row.No,
        numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(
          Number,
        ),
      }))
      .filter(
        (row) =>
          Number.isFinite(Number(row.year)) &&
          Number.isFinite(Number(row.No)) &&
          row.numbers.length === 7 &&
          row.numbers.every((number) => number >= 1 && number <= 49),
      )
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          a.id - b.id,
      );
  }
}

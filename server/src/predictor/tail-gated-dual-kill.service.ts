import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = { id: number; year?: number; No?: number; numbers: number[] };

@Injectable()
export class TailGatedDualKillService {
  private readonly quadTails = new Set([0, 2, 3, 5, 6, 7]);
  private readonly phaseTails = new Set([1, 4, 8, 9]);

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    if (history.length < 514) {
      return { status: 'insufficient-history', historyCount: history.length, message: '期号尾门控双公式至少需要514期历史，才能展示完整500期回测。' };
    }
    const prediction = this.pick(history, history.length);
    const backtest20 = this.backtest(history, 20);
    const backtest50 = this.backtest(history, 50);
    const backtest100 = this.backtest(history, 100);
    const backtest200 = this.backtest(history, 200);
    const backtest500 = this.backtest(history, 500);
    return {
      status: [backtest20, backtest50, backtest100, backtest200].every((item) => item.successRate >= 0.97) ? 'stable' : 'watch',
      strategy: {
        key: 'periodTailGatedDualFormula', name: '期号尾门控双公式',
        quadTails: [...this.quadTails], phaseTails: [...this.phaseTails],
        description: '上一期期号尾数属于0/2/3/5/6/7时使用上一期第7位×4−2；属于1/4/8/9时使用14期锚点期号相位。',
      },
      prediction,
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      historyMeta: { count: history.length, latest: history[history.length - 1] },
      generatedAt: new Date().toISOString(),
    };
  }

  private pick(history: DrawRow[], t: number) {
    const previous = history[t - 1];
    const phaseNo = Number(previous.No || 0);
    const periodTail = ((phaseNo % 10) + 10) % 10;
    const useQuad = this.quadTails.has(periodTail);
    if (useQuad) {
      const anchorNumber = previous.numbers[6];
      const rawValue = 4 * anchorNumber - 2;
      const number = this.wrap(rawValue);
      return {
        number, display: String(number).padStart(2, '0'), branch: 'quad', branchLabel: '上一期七码四倍映射',
        phaseNo, periodTail, anchorNumber, anchorPosition: 7, anchorLag: 1, rawValue,
        source: { id: previous.id, year: previous.year, No: previous.No, numbers: previous.numbers },
        formula: `${anchorNumber} × 4 − 2 = ${rawValue} → ${String(number).padStart(2, '0')}`,
        reason: `上一期期号尾数${periodTail}命中四倍映射分支，取上一期第7位${String(anchorNumber).padStart(2, '0')}计算得到${String(number).padStart(2, '0')}。`,
      };
    }
    const source = history[t - 14];
    const anchorNumber = source.numbers[3];
    const rawValue = -3 * anchorNumber + 2 * phaseNo - 19;
    const number = this.wrap(rawValue);
    return {
      number, display: String(number).padStart(2, '0'), branch: 'phase', branchLabel: '14期锚点＋期号相位',
      phaseNo, periodTail, anchorNumber, anchorPosition: 4, anchorLag: 14, rawValue,
      source: { id: source.id, year: source.year, No: source.No, numbers: source.numbers },
      formula: `−3 × ${anchorNumber} + 2 × ${phaseNo} − 19 = ${rawValue} → ${String(number).padStart(2, '0')}`,
      reason: `上一期期号尾数${periodTail}命中期号相位分支，取14期前第4位${String(anchorNumber).padStart(2, '0')}计算得到${String(number).padStart(2, '0')}。`,
    };
  }

  private backtest(history: DrawRow[], count: number) {
    const start = Math.max(14, history.length - count);
    const rows = [];
    for (let t = start; t < history.length; t++) {
      const prediction = this.pick(history, t);
      const actual = history[t];
      rows.push({
        year: actual.year, No: actual.No, actualNumbers: actual.numbers,
        predictedNumber: prediction.number, predictedDisplay: prediction.display,
        branch: prediction.branch, branchLabel: prediction.branchLabel,
        phaseNo: prediction.phaseNo, periodTail: prediction.periodTail,
        anchorNumber: prediction.anchorNumber, anchorPosition: prediction.anchorPosition,
        anchorLag: prediction.anchorLag, anchorYear: prediction.source.year, anchorNo: prediction.source.No,
        formula: prediction.formula, success: !actual.numbers.includes(prediction.number),
      });
    }
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'walk-forward', count: rows.length, successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      rows: rows.slice().reverse(), failureRows: rows.filter((row) => !row.success).reverse(),
      branchCounts: {
        quad: rows.filter((row) => row.branch === 'quad').length,
        phase: rows.filter((row) => row.branch === 'phase').length,
      },
    };
  }

  private wrap(value: number) { return ((value - 1) % 49 + 49) % 49 + 1; }
  private normalizeRows(rows: any[]): DrawRow[] {
    return rows.map((row) => ({
      id: Number(row.id || 0), year: row.year, No: row.No,
      numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    })).filter((row) => row.numbers.length === 7 && row.numbers.every((n) => n >= 1 && n <= 49))
      .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.No || 0) - (b.No || 0) || a.id - b.id);
  }
}

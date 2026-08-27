import { HistoryService } from '../history/history.service';
import { AnchorPhase14KillService } from './anchor-phase-14-kill.service';
import { PreviousSevenQuadKillService } from './previous-seven-quad-kill.service';
import { QuadraticAnchor53KillService } from './quadratic-anchor-53-kill.service';
import { StateRiskKillService } from './state-risk-kill.service';
import { TenAnchorShiftKillService } from './ten-anchor-shift-kill.service';
import { summarizeKillBacktest } from './kill-backtest-summary';

describe('summarizeKillBacktest', () => {
  it('distinguishes regular-number hits from special-code hits and keeps newest rows first', () => {
    const actualNumbers = [1, 2, 3, 4, 5, 6, 7];
    const rows = [
      { No: 1, predictedNumber: 1, actualNumbers, success: false },
      { No: 2, predictedNumber: 7, actualNumbers, success: false },
      { No: 3, predictedNumber: 8, actualNumbers, success: true },
    ];
    const summary = summarizeKillBacktest(rows);
    expect(summary).toMatchObject({
      kind: 'walk-forward', count: 3, successCount: 1, failureCount: 2,
      successRate: 1 / 3, specialCodeMissCount: 2, specialCodeHitCount: 1,
      specialCodeMissRate: 2 / 3,
    });
    expect(summary.rows.map((row) => row.No)).toEqual([3, 2, 1]);
    expect(summary.failureRows.map((row) => row.No)).toEqual([2, 1]);
    expect(rows.map((row) => row.No)).toEqual([1, 2, 3]);
  });

  it('returns finite zero statistics for an empty window', () => {
    expect(summarizeKillBacktest([])).toMatchObject({
      count: 0, successRate: 0, specialCodeMissCount: 0,
      specialCodeHitCount: 0, specialCodeMissRate: 0, rows: [], failureRows: [],
    });
  });
});

describe('shared special-code statistics across the five kill pages', () => {
  const cases = [
    { Service: StateRiskKillService, historyCount: 305, windows: [20, 50, 100, 200], available: 5 },
    { Service: TenAnchorShiftKillService, historyCount: 560, windows: [20, 50, 100, 200, 500], available: 500 },
    { Service: PreviousSevenQuadKillService, historyCount: 560, windows: [20, 50, 100, 200, 500], available: 500 },
    { Service: QuadraticAnchor53KillService, historyCount: 560, windows: [20, 50, 100, 200, 500], available: 500 },
    { Service: AnchorPhase14KillService, historyCount: 560, windows: [20, 50, 100, 200, 500], available: 500 },
  ];

  it.each(cases)('$Service.name includes n7 miss counts for every window', async ({ Service, historyCount, windows, available }) => {
    const history = Array.from({ length: historyCount }, (_, index) => ({
      id: index + 1, year: 2025 + Math.floor(index / 365), No: index % 365 + 1,
      ...Object.fromEntries(Array.from({ length: 7 }, (_, position) => [
        `n${position + 1}`, (index * 11 + position * 5) % 49 + 1,
      ])),
    }));
    const historyService = { findAll: jest.fn().mockResolvedValue(history) } as unknown as HistoryService;
    const result = await new Service(historyService).getPrediction();
    expect(result.status).not.toBe('insufficient-history');
    if (!result.backtests) throw new Error('Expected backtests');
    const backtests: Record<string, ReturnType<typeof summarizeKillBacktest>> = result.backtests;

    for (const window of windows) {
      const summary = backtests[`backtest${window}`];
      const missCount = summary.rows.filter((row) => row.predictedNumber !== row.actualNumbers[6]).length;
      const successCount = summary.rows.filter((row) => !row.actualNumbers.includes(row.predictedNumber)).length;
      expect(summary).toMatchObject({
        count: Math.min(window, available), successCount,
        specialCodeMissCount: missCount,
        specialCodeHitCount: summary.count - missCount,
        specialCodeMissRate: missCount / summary.count,
      });
      expect(summary.specialCodeMissCount).toBeGreaterThanOrEqual(summary.successCount);
    }
  });
});

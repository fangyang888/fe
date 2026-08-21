import { EliteFourKillService } from './elite-four-kill.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const in2026 = index >= 365;
    return {
      id: index + 1,
      year: in2026 ? 2026 : 2025,
      No: in2026 ? index - 364 : index + 1,
      n1: 2,
      n2: 3,
      n3: 4,
      n4: 5,
      n5: 6,
      n6: 7,
      n7: 8,
    };
  });

describe('EliteFourKillService', () => {
  it('keeps five frozen 100-period segments separate from period-199 validation', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(700)),
    };
    const service = new EliteFourKillService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result).toMatchObject({
      status: 'frozen-comparison',
      strategy: {
        modelCount: 4,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: { year: 2026, No: 199 },
      },
    });
    expect(result.models.map((model: any) => [model.code, model.prediction.number]))
      .toEqual([
        ['F', 14],
        ['Q17', 36],
        ['DT', 19],
        ['L63', 44],
      ]);

    for (const model of result.models) {
      expect(model.frozenBacktests.backtest500.count).toBe(500);
      expect(model.segments.map((segment: any) => segment.count))
        .toEqual([100, 100, 100, 100, 100]);
      expect(model.validation).toMatchObject({
        kind: 'prospective-frozen',
        count: 137,
        start: { year: 2026, No: 199 },
      });
      expect(model.recent.rows).toHaveLength(20);
    }
  });

  it('requires a complete frozen 500-period comparison window', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(562)),
    };
    const service = new EliteFourKillService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 562,
    });
  });
});

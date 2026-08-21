import { AdaptiveAnchorSuiteService } from './adaptive-anchor-suite.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const year = index < 365 ? 2024 : index < 730 ? 2025 : 2026;
    const No = index < 365 ? index + 1 : index < 730 ? index - 364 : index - 729;
    return {
      id: index + 1,
      year,
      No,
      n1: 2,
      n2: 3,
      n3: 4,
      n4: 5,
      n5: 6,
      n6: 7,
      n7: 8,
    };
  });

describe('AdaptiveAnchorSuiteService', () => {
  it('returns the five frozen algorithms with only 10/20/50/100/200 windows', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(1000)),
    };
    const service = new AdaptiveAnchorSuiteService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result).toMatchObject({
      status: 'selection-locked',
      strategy: {
        algorithmCount: 5,
        windows: [10, 20, 50, 100, 200],
        researchCutoff: { year: 2026, No: 198 },
        selectionLockedAt: { year: 2026, No: 211 },
        trueForwardStart: { year: 2026, No: 212 },
      },
    });
    expect(result.algorithms.map((item: any) => [item.code, item.prediction.number]))
      .toEqual([
        ['K', 48],
        ['R50', 48],
        ['R20/50', 48],
        ['M10', 13],
        ['A100', 13],
      ]);

    for (const algorithm of result.algorithms) {
      expect(Object.keys(algorithm.rollingBacktests)).toEqual([
        'backtest10',
        'backtest20',
        'backtest50',
        'backtest100',
        'backtest200',
      ]);
      expect(Object.values(algorithm.rollingBacktests).map((item: any) => item.count))
        .toEqual([10, 20, 50, 100, 200]);
      expect(algorithm.observedValidation.count).toBe(13);
      expect(algorithm.forwardValidation.count).toBe(59);
      expect(algorithm.recent.rows).toHaveLength(20);
    }
  });

  it('reports insufficient history when the frozen research sample is unavailable', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(450)),
    };
    const service = new AdaptiveAnchorSuiteService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 450,
    });
  });
});

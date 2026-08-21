import { SelectedAnchorSuiteService } from './selected-anchor-suite.service';

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

describe('SelectedAnchorSuiteService', () => {
  it('returns G-H-I-J with frozen research, observed validation, and post-selection forward rows', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(1000)),
    };
    const service = new SelectedAnchorSuiteService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result).toMatchObject({
      status: 'selection-locked',
      strategy: {
        modelCount: 4,
        researchCutoff: { year: 2026, No: 198 },
        selectionLockedAt: { year: 2026, No: 211 },
        trueForwardStart: { year: 2026, No: 212 },
      },
    });
    expect(result.models.map((model: any) => [model.code, model.prediction.number]))
      .toEqual([
        ['G', 41],
        ['H', 20],
        ['I', 43],
        ['J', 5],
      ]);

    for (const model of result.models) {
      expect(model.frozenBacktests.backtest500.count).toBe(500);
      expect(model.segments.map((segment: any) => segment.count))
        .toEqual([100, 100, 100, 100, 100]);
      expect(model.observedValidation.count).toBe(13);
      expect(model.forwardValidation.count).toBe(59);
      expect(model.recent.rows).toHaveLength(20);
    }
  });

  it('reports insufficient history when the research cutoff is unavailable', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(900)),
    };
    const service = new SelectedAnchorSuiteService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 900,
    });
  });
});

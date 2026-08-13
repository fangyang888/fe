import { AnchorInteractionSuiteService } from './anchor-interaction-suite.service';

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

describe('AnchorInteractionSuiteService', () => {
  it('separates the 199-224 replay from prospective validation at period 225', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(700)),
    };
    const service = new AnchorInteractionSuiteService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result.models).toHaveLength(4);
    expect(
      result.models.map((model: any) => [
        model.key,
        model.prediction.number,
        model.prediction.rawValue,
      ]),
    ).toEqual([
      ['dualAnchorSquareSum', 24, 73],
      ['fourAnchorDifferenceInteraction', 6, 55],
      ['fourAnchorBitwiseXor', 11, 60],
      ['tripleAnchorProductInteraction', 17, -130],
    ]);
    for (const model of result.models) {
      expect(model.backtests.backtest500.count).toBe(500);
      expect(model.historicalValidation).toMatchObject({
        kind: 'historical-holdout-replay',
        count: 26,
        start: { year: 2026, No: 199 },
        end: { year: 2026, No: 224 },
      });
      expect(model.validation).toMatchObject({
        kind: 'prospective-frozen',
        count: 111,
        start: { year: 2026, No: 225 },
      });
    }
  });

  it('requires enough rows for the longest anchor and a 500-period backtest', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(636)),
    };
    const service = new AnchorInteractionSuiteService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 636,
    });
  });
});

import { GatedAnchorSuiteService } from './gated-anchor-suite.service';

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

describe('GatedAnchorSuiteService', () => {
  it('returns five frozen formulas with prospective validation from period 199', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(700)),
    };
    const service = new GatedAnchorSuiteService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result).toMatchObject({
      status: 'frozen',
      strategy: {
        modelCount: 5,
        frozenAt: { year: 2026, No: 198 },
        prospectiveStart: { year: 2026, No: 199 },
      },
    });
    expect(
      result.models.map((model: any) => [
        model.code,
        model.prediction.number,
        model.prediction.gate.remainder,
      ]),
    ).toEqual([
      ['A', 28, 0],
      ['B', 9, 2],
      ['C', 23, 0],
      ['D', 34, 2],
      ['E', 22, 1],
    ]);

    for (const model of result.models) {
      expect(model.backtests.backtest200.count).toBe(200);
      expect(model.segments.map((segment: any) => segment.count)).toEqual([
        50, 50, 50, 50,
      ]);
      expect(model.validation).toMatchObject({
        kind: 'prospective-frozen',
        count: 137,
        start: { year: 2026, No: 199 },
      });
    }
  });

  it('requires the longest lag plus a complete 200-period research window', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(589)),
    };
    const service = new GatedAnchorSuiteService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 589,
    });
  });
});

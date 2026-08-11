import { LatentFactorKillService } from './latent-factor-kill.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const year = index < 365 ? 2024 : index < 730 ? 2025 : 2026;
    const offset =
      year === 2024 ? index : year === 2025 ? index - 365 : index - 730;
    const start = (index * 7) % 49;
    const numbers = Array.from(
      { length: 7 },
      (_, position) => ((start + position) % 49) + 1,
    );
    return {
      id: index + 1,
      year,
      No: offset + 1,
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      n6: numbers[5],
      n7: numbers[6],
    };
  });

describe('LatentFactorKillService', () => {
  it('returns a frozen low-rank factor report with strict prospective separation', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(800)),
    };
    const service = new LatentFactorKillService(historyService as any);

    const result = (await service.getPrediction()) as any;

    expect(result.strategy).toMatchObject({
      key: 'lowRankDynamicFactorV1',
      family: 'latent-state-space',
      window: 192,
      factorCount: 4,
      prospectiveStart: { year: 2026, No: 199 },
    });
    expect(result.prediction.number).toBeGreaterThanOrEqual(1);
    expect(result.prediction.number).toBeLessThanOrEqual(49);
    expect(result.factors).toHaveLength(4);
    expect(result.factorMap).toHaveLength(49);
    expect(result.backtests.backtest500.count).toBe(500);
    expect(result.validation.start).toEqual({ year: 2026, No: 199 });
  });

  it('requires enough history for the complete 500-period report', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(691)),
    };
    const service = new LatentFactorKillService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 691,
    });
  });
});

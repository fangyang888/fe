import { RoughCopulaRqaKillService } from './rough-copula-rqa-kill.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const year = index < 365 ? 2024 : index < 730 ? 2025 : 2026;
    const No =
      index < 365 ? index + 1 : index < 730 ? index - 364 : index - 729;
    const start = (index * 11 + Math.floor(index / 17)) % 49;
    const numbers = Array.from(
      { length: 7 },
      (_, position) => ((start + position * 6) % 49) + 1,
    );
    return {
      id: index + 1,
      year,
      No,
      n1: numbers[0],
      n2: numbers[1],
      n3: numbers[2],
      n4: numbers[3],
      n5: numbers[4],
      n6: numbers[5],
      n7: numbers[6],
    };
  });

describe('RoughCopulaRqaKillService', () => {
  it('freezes all three models at 2026-198 and starts prospective statistics at 199', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(930)),
    };
    const service = new RoughCopulaRqaKillService(historyService as any);

    const result = (await service.getPrediction()) as any;

    expect(result.status).toBe('frozen-observation');
    expect(result.frozenAt).toEqual({ year: 2026, No: 198 });
    expect(result.prospectiveStart).toEqual({ year: 2026, No: 199 });
    expect(result.models).toHaveLength(3);
    expect(result.models.map((model: any) => model.shortKey)).toEqual([
      'pawlak',
      'copula',
      'rqa',
    ]);
    for (const model of result.models) {
      expect(model.prediction.number).toBeGreaterThanOrEqual(1);
      expect(model.prediction.number).toBeLessThanOrEqual(49);
      expect(model.prediction.riskMap).toHaveLength(49);
      expect(model.backtests.backtest10.count).toBe(10);
      expect(model.backtests.backtest200.count).toBe(200);
      expect(model.validation.count).toBe(2);
      expect(model.validation.rows[0]).toMatchObject({ year: 2026, No: 200 });
      expect(model.validation.rows[1]).toMatchObject({ year: 2026, No: 199 });
    }
  });

  it('requires enough history for the frozen 200-period baseline', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(423)),
    };
    const service = new RoughCopulaRqaKillService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 423,
    });
  });
});

import { RobustBlockKillService } from './robust-block-kill.service';

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

describe('RobustBlockKillService', () => {
  it('returns a fixed eight-block distributionally robust report', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(500)),
    };
    const service = new RobustBlockKillService(historyService as any);

    const result = (await service.getPrediction()) as any;

    expect(result.strategy).toMatchObject({
      key: 'distributionallyRobustBlockConsensusV1',
      family: 'distributionally-robust-optimization',
      window: 192,
      blockCount: 8,
      blockSize: 24,
      iqrPenalty: 0.25,
      prospectiveStart: { year: 2026, No: 199 },
    });
    expect(result.prediction.number).toBeGreaterThanOrEqual(1);
    expect(result.prediction.number).toBeLessThanOrEqual(49);
    expect(result.riskMap).toHaveLength(49);
    expect(result.blockProfile).toHaveLength(8);
    expect(result.backtests.backtest10.count).toBe(10);
    expect(result.backtests.backtest200.count).toBe(200);
  });

  it('requires enough history for a complete 200-period report', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(391)),
    };
    const service = new RobustBlockKillService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 391,
    });
  });
});

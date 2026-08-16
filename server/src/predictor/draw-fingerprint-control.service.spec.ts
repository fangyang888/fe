import { DrawFingerprintControlService } from './draw-fingerprint-control.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const in2026 = index >= 400;
    return {
      id: index + 1,
      year: in2026 ? 2026 : 2025,
      No: in2026 ? index - 399 : index + 1,
      n1: 2,
      n2: 8,
      n3: 14,
      n4: 20,
      n5: 26,
      n6: 32,
      n7: 38,
    };
  });

describe('DrawFingerprintControlService', () => {
  it('keeps frozen backtests separate from period-199 prospective rows', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(700)),
    };
    const service = new DrawFingerprintControlService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result.strategy).toMatchObject({
      key: 'drawFingerprintHashControl',
      salt: 2199518,
      frozenAt: { year: 2026, No: 198 },
      prospectiveStart: { year: 2026, No: 199 },
    });
    expect(result.frozenBacktests.backtest500.count).toBe(500);
    expect(result.validation.count).toBe(102);
    expect(result.prediction.target).toEqual({ year: 2026, No: 301 });
  });

  it('requires enough history for a 500-period comparison', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(500)),
    };
    const service = new DrawFingerprintControlService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 500,
    });
  });
});

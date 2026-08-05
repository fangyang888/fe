import { LinearAnchor63FirstKillService } from './linear-anchor-63-first-kill.service';

const buildHistory = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const in2026 = index >= 365;
    return {
      id: index + 1,
      year: in2026 ? 2026 : 2025,
      No: in2026 ? index - 364 : index + 1,
      n1: 1,
      n2: 2,
      n3: 3,
      n4: 4,
      n5: 5,
      n6: 6,
      n7: 7,
    };
  });

describe('LinearAnchor63FirstKillService', () => {
  it('returns the next prediction and keeps period 199+ as prospective validation', async () => {
    const historyService = { findAll: jest.fn().mockResolvedValue(buildHistory(563)) };
    const service = new LinearAnchor63FirstKillService(historyService as any);

    const result = await service.getPrediction();
    const ready = result as any;

    expect(ready.status).toBe('stable');
    expect(ready.prediction).toMatchObject({
      number: 41,
      anchorNumber: 1,
      rawValue: 41,
      source: { year: 2026, No: 136 },
    });
    expect(ready.backtests.backtest500).toMatchObject({
      count: 500,
      successCount: 500,
      failureCount: 0,
    });
    expect(ready.validation).toMatchObject({
      kind: 'prospective',
      count: 0,
      start: { year: 2026, No: 199 },
    });
  });

  it('requires enough history for a complete 500-period backtest', async () => {
    const historyService = { findAll: jest.fn().mockResolvedValue(buildHistory(562)) };
    const service = new LinearAnchor63FirstKillService(historyService as any);

    await expect(service.getPrediction()).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 562,
    });
  });
});

import { DualAnchor4963KillService } from './dual-anchor-49-63-kill.service';
import { ShortLongAnchor149KillService } from './short-long-anchor-1-49-kill.service';
import { TripleAnchorLinearKillService } from './triple-anchor-linear-kill.service';

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

describe('prospective dual-anchor kill services', () => {
  it('calculates the 1+49 anchor prediction and starts validation at period 199', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(563)),
    };
    const service = new ShortLongAnchor149KillService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result.prediction).toMatchObject({
      number: 39,
      rawValue: 39,
      firstNumber: 2,
      secondNumber: 4,
      firstSource: { year: 2026, No: 198 },
      secondSource: { year: 2026, No: 150 },
    });
    expect(result.backtests.backtest500).toMatchObject({
      count: 500,
      successCount: 500,
    });
    expect(result.validation).toMatchObject({
      kind: 'prospective',
      count: 0,
      start: { year: 2026, No: 199 },
    });
  });

  it('calculates and wraps the 49+63 anchor prediction', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(563)),
    };
    const service = new DualAnchor4963KillService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result.prediction).toMatchObject({
      number: 47,
      rawValue: -2,
      firstNumber: 5,
      secondNumber: 2,
      firstSource: { year: 2026, No: 150 },
      secondSource: { year: 2026, No: 136 },
    });
    expect(result.backtests.backtest500).toMatchObject({
      count: 500,
      successCount: 500,
    });
    expect(result.validation).toMatchObject({ kind: 'prospective', count: 0 });
  });

  it('uses the largest anchor lag when checking minimum history', async () => {
    const shortHistory = {
      findAll: jest.fn().mockResolvedValue(buildHistory(548)),
    };
    const longHistory = {
      findAll: jest.fn().mockResolvedValue(buildHistory(562)),
    };

    await expect(
      new ShortLongAnchor149KillService(shortHistory as any).getPrediction(),
    ).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 548,
    });
    await expect(
      new DualAnchor4963KillService(longHistory as any).getPrediction(),
    ).resolves.toMatchObject({
      status: 'insufficient-history',
      historyCount: 562,
    });
  });

  it('calculates three anchors and restarts validation at period 199', async () => {
    const historyService = {
      findAll: jest.fn().mockResolvedValue(buildHistory(600)),
    };
    const service = new TripleAnchorLinearKillService(historyService as any);
    const result = (await service.getPrediction()) as any;

    expect(result.prediction).toMatchObject({
      number: 5,
      rawValue: -44,
      firstNumber: 5,
      secondNumber: 3,
      thirdNumber: 7,
      firstSource: { year: 2026, No: 183 },
      secondSource: { year: 2026, No: 184 },
      thirdSource: { year: 2026, No: 141 },
    });
    expect(result.backtests.backtest500).toMatchObject({
      count: 500,
      successCount: 0,
    });
    expect(result.validation).toMatchObject({
      kind: 'prospective',
      count: 37,
      start: { year: 2026, No: 199 },
    });
  });
});

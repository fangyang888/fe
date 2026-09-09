import { readFileSync } from 'fs';
import { join } from 'path';
import { PreviousFourthService } from './previous-fourth.service';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/online-risk-2026.json'), 'utf8'),
) as { numbers: number[][] };
const records = fixture.numbers.map((numbers, i) => ({
  year: 2026,
  No: i + 1,
  ...Object.fromEntries(numbers.map((n, j) => [`n${j + 1}`, n])),
}));
const draw251 = {
  year: 2026,
  No: 251,
  n1: 9,
  n2: 6,
  n3: 11,
  n4: 25,
  n5: 8,
  n6: 45,
  n7: 30,
  numberInfos: [{ number: 25, color: '蓝' }],
};

describe('PreviousFourthService', () => {
  it('reproduces the fixed 88/100 audit using the source original fourth position', async () => {
    const mock = { findAll: jest.fn().mockResolvedValue(records) };
    const result = await new PreviousFourthService(mock as any).getPrediction();
    expect(mock.findAll).toHaveBeenCalledWith(2026);
    expect(result).toMatchObject({
      status: 'ready',
      target: { year: 2026, No: 251 },
      prediction: { number: 47, position: 4 },
      stages: {
        selection: { count: 50, successCount: 45 },
        audit: {
          count: 100,
          successCount: 88,
          complete: true,
          targetPassed: false,
        },
      },
    });
    if (result.status !== 'ready') throw new Error('Expected ready report');
    for (const r of result.rows) {
      expect(r.source.No).toBe(r.No - 1);
      expect(r.predictedNumber).toBe(r.source.numbers[3]);
      expect(r.success).toBe(!r.numbers.includes(r.predictedNumber));
    }
  });

  it('sorts records, ignores other years, displays colors without changing the pick, and updates on new data', async () => {
    const mock = { findAll: jest.fn().mockResolvedValue(records) };
    const service = new PreviousFourthService(mock as any);
    const first = await service.getPrediction();
    expect(await service.getPrediction()).toBe(first);
    mock.findAll.mockResolvedValue([
      { ...records[0], year: 2025 },
      draw251,
      ...records.slice().reverse(),
    ]);
    const next = await service.getPrediction();
    expect(next).not.toBe(first);
    expect(next).toMatchObject({
      historyCount: 251,
      target: { No: 252 },
      prediction: { number: 25, color: '蓝' },
      stages: { after250: { count: 1, successCount: 1 } },
    });
    if (first.status !== 'ready' || next.status !== 'ready')
      throw new Error('Expected ready report');
    expect(next.rows.slice(1)).toEqual(first.rows);
    expect(next.rows[0]).toMatchObject({
      No: 251,
      predictedNumber: 47,
      success: true,
    });
  });

  it.each([
    ['missing first period', records.slice(1)],
    ['gap', records.filter((r) => r.No !== 149)],
    ['duplicate period', [...records, records[0]]],
    ['duplicate ball', [{ ...records[0], n1: 8, n2: 8 }, ...records.slice(1)]],
    ['invalid ball', [{ ...records[0], n4: 49.5 }, ...records.slice(1)]],
  ])(
    'rejects %s rather than calling a non-adjacent draw the previous period',
    async (_, input) => {
      const result = await new PreviousFourthService({
        findAll: jest.fn().mockResolvedValue(input),
      } as any).getPrediction();
      expect(result.status).toBe('invalid-history');
      expect(result).not.toHaveProperty('prediction');
    },
  );

  it('supports one draw without fabricating backtest results, and handles empty input', async () => {
    const mock = { findAll: jest.fn().mockResolvedValue([]) };
    const service = new PreviousFourthService(mock as any);
    expect(await service.getPrediction()).toMatchObject({
      status: 'insufficient-history',
    });
    mock.findAll.mockResolvedValue([records[0]]);
    const result = await service.getPrediction();
    expect(result).toMatchObject({
      status: 'ready',
      target: { No: 2 },
      prediction: { number: 33 },
      rows: [],
    });
    if (result.status !== 'ready') throw new Error('Expected ready report');
    expect(
      result.rolling.every((r) => r.count === 0 && r.successRate === null),
    ).toBe(true);
  });

  it('does not fabricate a target in the next year', async () => {
    const fullYear = Array.from({ length: 365 }, (_, i) => ({
      ...records[i % records.length],
      No: i + 1,
    }));
    const result = await new PreviousFourthService({
      findAll: jest.fn().mockResolvedValue(fullYear),
    } as any).getPrediction();
    expect(result).toMatchObject({
      status: 'ready',
      target: null,
      prediction: null,
    });
  });
});

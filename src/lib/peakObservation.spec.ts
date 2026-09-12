import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPeakObservation, isPeak } from './peakObservation';

function record(No: number, n6: number, n7 = 49, normalHit = false) {
  const first = Array.from({ length: 49 }, (_, i) => i + 1).filter(n => n !== n6 && n !== n7 && n !== 28).slice(0, 5);
  if (normalHit) first[0] = 28;
  return { year: 2026, No, n1: first[0], n2: first[1], n3: first[2], n4: first[3], n5: first[4], n6, n7 };
}
const prefix = () => [record(1, 10), record(2, 10), record(3, 40), record(4, 20)];

describe('fixed N6 peak observation', () => {
  it('uses strict rise then fall, not flat lines or sorted values', () => {
    expect(isPeak([48, 49, 10])).toBe(true);
    expect(isPeak([49, 48, 10])).toBe(false);
    expect(isPeak([48, 48, 10])).toBe(false);
  });
  it('scores all-seven and special-code misses separately', () => {
    const regular = buildPeakObservation([...prefix(), record(5, 15, 49, true)]);
    expect(regular.total).toMatchObject({ count: 1, successCount: 0, specialCodeMissCount: 1 });
    const special = buildPeakObservation([...prefix(), record(5, 15, 28)]);
    expect(special.total).toMatchObject({ count: 1, successCount: 0, specialCodeMissCount: 0 });
    const neither = buildPeakObservation([...prefix(), record(5, 15)]);
    expect(neither.total).toMatchObject({ count: 1, successCount: 1, specialCodeMissCount: 1 });
  });
  it('does not use the target outcome to decide whether to trigger', () => {
    const a = buildPeakObservation([...prefix(), record(5, 15)]);
    const b = buildPeakObservation([...prefix(), record(5, 45, 28)]);
    expect(a.rows[0].state).toBe('triggered');
    expect(b.rows[0].state).toBe('triggered');
    expect(a.rows[0].sources).toEqual(b.rows[0].sources);
  });
  it('does not count untriggered draws as successes or emit a current number', () => {
    const r = buildPeakObservation([record(1, 10), record(2, 15), record(3, 20), record(4, 25), record(5, 30)]);
    expect(r.total.count).toBe(0);
    expect(r.currentState).toBe('not-triggered');
    expect(r.rows[0].success).toBeNull();
  });
  it('never bridges gaps, duplicates, or a malformed latest period', () => {
    const gap = buildPeakObservation([record(1, 10), record(2, 10), record(4, 40), record(5, 20)]);
    expect(gap.total.count).toBe(0);
    expect(gap.currentState).toBe('incomplete');
    const duplicate = buildPeakObservation([...prefix(), record(3, 42), record(5, 15)]);
    expect(duplicate.total.count).toBe(0);
    expect(duplicate.integrity.duplicatePeriods).toBe(1);
    const malformed = buildPeakObservation([...prefix(), { ...record(5, 15), n7: 100 }]);
    expect(malformed.latestNo).toBe(5);
    expect(malformed.currentState).toBe('incomplete');
  });
  it('sorts descending API results and uses calendar-period windows rather than last triggers', () => {
    const rows = [record(1, 10), ...Array.from({ length: 24 }, (_, i) => record(i + 2, 20 + i))];
    rows[2] = record(3, 48);rows[3] = record(4, 10);
    const r = buildPeakObservation([...rows].reverse());
    expect(r.total.count).toBeGreaterThan(0);
    expect(r.windows.find(w => w.window === 10)?.count).toBe(0);
    expect(r.latestNo).toBe(25);
  });
  it('returns no fake rates for an empty response and rejects malformed envelopes', () => {
    expect(buildPeakObservation([]).total.count).toBe(0);
    expect(() => buildPeakObservation({ records: [] })).toThrow('格式错误');
  });
  it('reproduces the published research snapshot without hardcoded UI percentages', () => {
    const data = JSON.parse(readFileSync(new URL('../../analysis/history-2026/data.json', import.meta.url), 'utf8'));
    const r = buildPeakObservation(data);
    expect(r.total).toMatchObject({ count: 80, successCount: 75 });
    expect(r.ranges[0]).toMatchObject({ count: 45, successCount: 43 });
    expect(r.ranges[1]).toMatchObject({ count: 35, successCount: 32 });
    expect(r.ranges[2].count).toBe(0);
    const fired = r.rows.filter(row => row.state === 'triggered');
    expect(r.total.specialCodeMissCount).toBe(fired.filter(row => row.draw.numbers[6] !== 28).length);
  });
});

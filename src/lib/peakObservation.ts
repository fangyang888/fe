export const PEAK_YEAR = 2026;
export const PEAK_NUMBER = 28;
export const OBSERVATION_START = 255;
export const PEAK_WINDOWS = [10, 20, 50, 100, 200] as const;

export type PeakDraw = { year: number; No: number; numbers: number[] };
export type PeakRow = {
  draw: PeakDraw;
  sources: PeakDraw[];
  state: 'triggered' | 'not-triggered' | 'incomplete';
  success: boolean | null;
  specialCodeMiss: boolean | null;
};
export function isPeak(values: number[]) {
  return values.length === 3 && values[0] < values[1] && values[1] > values[2];
}
export function summarizePeak(rows: PeakRow[]) {
  const fired = rows.filter(row => row.state === 'triggered');
  const count = fired.length;
  const successCount = fired.filter(row => row.success).length;
  const specialCodeMissCount = fired.filter(row => row.specialCodeMiss).length;
  return { count, successCount, successRate: count ? successCount / count : 0,
    specialCodeMissCount, specialCodeMissRate: count ? specialCodeMissCount / count : 0,
    failureCount: count - successCount };
}

/** Fixed N6 peak rule; all features precede the target, and missing periods are never bridged. */
export function buildPeakObservation(input: unknown) {
  if (!Array.isArray(input)) throw new Error('历史接口返回格式错误，应为记录数组');
  const buckets = new Map<number, PeakDraw[]>();
  let rejected = 0;
  let latestNo: number | null = null;
  for (const value of input) {
    if (!value || typeof value !== 'object') { rejected++; continue; }
    const r = value as Record<string, unknown>;
    if (r.year !== PEAK_YEAR || typeof r.No !== 'number' || !Number.isSafeInteger(r.No) || r.No < 1) { rejected++; continue; }
    latestNo = Math.max(latestNo ?? 0, r.No);
    // Reserve the period even when a row is malformed; never silently substitute a duplicate.
    const existing = buckets.get(r.No) ?? [];
    const numbers = Array.from({ length: 7 }, (_, i) => r[`n${i + 1}`]);
    const valid = numbers.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 49) && new Set(numbers).size === 7;
    if (!valid) { rejected++; existing.push({ year: PEAK_YEAR, No: r.No, numbers: [] }); }
    else existing.push({ year: PEAK_YEAR, No: r.No, numbers: numbers as number[] });
    buckets.set(r.No, existing);
  }
  const draws: PeakDraw[] = [];
  let duplicatePeriods = 0;
  for (const entries of buckets.values()) {
    if (entries.length !== 1) { duplicatePeriods++; continue; }
    if (entries[0].numbers.length === 7) draws.push(entries[0]);
  }
  draws.sort((a, b) => a.No - b.No);
  const byNo = new Map(draws.map(d => [d.No, d]));
  const previous = (end: number) => [end - 2, end - 1, end].map(no => byNo.get(no)).filter((d): d is PeakDraw => Boolean(d));
  const rows: PeakRow[] = draws.filter(d => d.No >= 5).map(draw => {
    const sources = previous(draw.No - 1);
    const state = sources.length !== 3 ? 'incomplete' : isPeak(sources.map(d => d.numbers[5])) ? 'triggered' : 'not-triggered';
    return { draw, sources, state, success: state === 'triggered' ? !draw.numbers.includes(PEAK_NUMBER) : null,
      specialCodeMiss: state === 'triggered' ? draw.numbers[6] !== PEAK_NUMBER : null };
  });
  const currentSources = latestNo === null ? [] : previous(latestNo);
  const currentState = currentSources.length !== 3 ? 'incomplete' : isPeak(currentSources.map(d => d.numbers[5])) ? 'triggered' : 'not-triggered';
  const ranges = [
    { label: '前段研究 · 5～150期', rows: rows.filter(r => r.draw.No <= 150) },
    { label: '后段回看 · 151～253期', rows: rows.filter(r => r.draw.No >= 151 && r.draw.No <= 253) },
    { label: '后续观察 · 255期起', rows: rows.filter(r => r.draw.No >= OBSERVATION_START) },
  ].map(range => ({ label: range.label, ...summarizePeak(range.rows) }));
  return { draws, rows, latestNo, currentSources, currentState,
    total: summarizePeak(rows), ranges,
    windows: PEAK_WINDOWS.map(window => ({ window, ...summarizePeak(rows.filter(row => latestNo !== null && row.draw.No > latestNo - window)) })),
    integrity: { rejected, duplicatePeriods, missingOrInvalidPeriods: latestNo === null ? 0 : latestNo - draws.length,
      incompleteTargets: rows.filter(row => row.state === 'incomplete').length },
  };
}
export type PeakObservation = ReturnType<typeof buildPeakObservation>;

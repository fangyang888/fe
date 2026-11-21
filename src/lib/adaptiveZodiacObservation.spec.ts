import {describe, expect, it} from 'vitest';
import {buildAdaptiveZodiacObservation, ZODIACS} from './adaptiveZodiacObservation';
import {ZODIAC_VECTOR_CONFIG} from './vectorZodiacObservation';

function history(count: number) {
  let seed = 1677;
  return Array.from({length: count}, (_, index) => {
    const numbers = new Set<number>();
    while (numbers.size < 7) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      numbers.add(seed % 49 + 1);
    }
    const balls = [...numbers];
    return {
      year: 2026, No: index + 1,
      ...Object.fromEntries(balls.map((number, position) => [`n${position + 1}`, number])),
      numberInfos: balls.map(number => ({number, zodiac: ZODIACS[(number - 1) % ZODIACS.length]})),
    };
  });
}

describe('independent zodiac vector replay', () => {
  it('selects three distinct zodiac signs using only data before the target issue', () => {
    const input = history(190);
    const before = buildAdaptiveZodiacObservation(input.slice(0, 165));
    const after = buildAdaptiveZodiacObservation(input);
    const forecast = before.current?.vector;
    expect(forecast?.selected).toHaveLength(3);
    expect(new Set(forecast?.selected).size).toBe(3);
    expect(forecast?.scores).toHaveLength(12);
    expect(forecast?.scores.reduce((sum, row) => sum + row.score, 0)).toBeCloseTo(1);
    expect(forecast?.nearest.every(row => row.No < 166 - ZODIAC_VECTOR_CONFIG.lookback)).toBe(true);
    const settled = after.rows.find(row => row.targetNo === 166);
    expect(settled?.vector).toEqual(forecast);
    expect(settled?.vectorSuccess).toBe(!forecast?.selected.includes(input[165].numberInfos[6].zodiac));
    expect(after.vectorTotal.count).toBe(40);
  });

  it('pauses the vector forecast when a recent regular ball is missing while preserving the legacy result', () => {
    const input = history(165);
    input[164].numberInfos[0].number = 0;
    const observation = buildAdaptiveZodiacObservation(input);
    expect(observation.integrity.vectorMissingMetadata).toBe(1);
    expect(observation.current?.vector).toBeNull();
    expect(observation.current?.selected).toHaveLength(3);
  });
});

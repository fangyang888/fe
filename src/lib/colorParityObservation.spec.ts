import {describe, expect, it} from 'vitest';
import {
  buildColorParityObservation,
  COLOR_PARITY_VECTOR_WINDOWS,
  MODE_META,
  MODEL_KEYS,
  standardColorForNumber,
} from './colorParityObservation';

function generateSyntheticHistory(count: number) {
  let seed = 20261127;
  return Array.from({length: count}, (_, index) => {
    const picked = new Set<number>();
    while (picked.size < 7) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      picked.add((seed % 49) + 1);
    }
    const balls = [...picked];
    return {
      year: 2026,
      No: index + 1,
      ...Object.fromEntries(balls.map((num, pos) => [`n${pos + 1}`, num])),
      numberInfos: balls.map(num => ({
        number: num,
        color: standardColorForNumber(num)!,
        zodiac: '马',
      })),
    };
  });
}

describe('color-parity observation dual-model causal engine', () => {
  it('exposes only ensemble and prior models and partitions all 49 balls cleanly', () => {
    expect(MODEL_KEYS).toEqual(['ensemble', 'prior']);
    for (const mode of ['subWave', 'halfWave'] as const) {
      const classes = MODE_META[mode].classes;
      const allNumbers = classes.flatMap(c => c.numbers);
      expect(allNumbers).toHaveLength(49);
      expect(new Set(allNumbers).size).toBe(49);
      expect(classes.reduce((sum, c) => sum + c.prior, 0)).toBeCloseTo(1, 10);
    }
    const minSubPools = MODE_META.subWave.classes.filter(c => c.isMinPool).map(c => c.label);
    expect(minSubPools).toEqual(['红大单', '绿小双', '蓝小单']);
    expect(MODE_META.subWave.theoreticalMaxNotRate).toBeCloseTo(46 / 49, 10);
    expect(MODE_META.halfWave.theoreticalMaxNotRate).toBeCloseTo(42 / 49, 10);
  });

  it('produces strictly causal predictions without look-ahead and locks subWave ensemble to 3-ball min pools', () => {
    const fullInput = generateSyntheticHistory(140);
    const minPools = new Set(['红大单', '绿小双', '蓝小单']);

    for (const mode of ['subWave', 'halfWave'] as const) {
      const before = buildColorParityObservation(fullInput.slice(0, 115), mode);
      const after = buildColorParityObservation(fullInput, mode);

      const currentRow = before.current;
      const settledRow = after.rows.find(row => row.targetNo === 116);
      expect(currentRow?.targetNo).toBe(116);
      expect(settledRow).toBeDefined();

      for (const model of MODEL_KEYS) {
        expect(settledRow?.forecasts[model]).toEqual(currentRow?.forecasts[model]);
        const forecast = currentRow!.forecasts[model];
        expect(forecast.probs.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 8);
        expect(forecast.pickLabel).toBe(forecast.ranked[0].label);
      }

      if (mode === 'subWave') {
        expect(after.rows.every(r => minPools.has(r.forecasts.ensemble.pickLabel))).toBe(true);
        expect(after.rows.every(r => minPools.has(r.forecasts.prior.pickLabel))).toBe(true);
      }

      expect(currentRow?.vectorWindows.length).toBe(COLOR_PARITY_VECTOR_WINDOWS.length);
      for (const win of currentRow!.vectorWindows) {
        expect(win.nearest.every(neighbor => neighbor.No < 116 - win.lookback)).toBe(true);
      }

      const actualSpecial = fullInput[115].n7;
      expect(settledRow?.actual?.specialNumber).toBe(actualSpecial);
      expect(settledRow?.results.ensemble).toBe(
        settledRow?.actual?.specialLabel !== currentRow?.forecasts.ensemble.pickLabel,
      );
    }
  });

  it('degrades gracefully when regular-ball metadata is missing', () => {
    const input = generateSyntheticHistory(110);
    input[109].numberInfos[0].number = 0;

    const result = buildColorParityObservation(input, 'subWave');
    expect(result.integrity.vectorMissingMetadata).toBe(1);
    expect(result.current?.vectorWindows).toHaveLength(0);
    expect(['红大单', '绿小双', '蓝小单']).toContain(result.current?.forecasts.ensemble.pickLabel);
    expect(result.current?.forecasts.prior.pickLabel).toBe('红大单');
  });

  it('rejects duplicate periods and supports JSON-encoded number_infos fallback', () => {
    const input = generateSyntheticHistory(100).map(row => ({
      year: row.year,
      No: row.No,
      n1: row.n1,
      n2: row.n2,
      n3: row.n3,
      n4: row.n4,
      n5: row.n5,
      n6: row.n6,
      n7: row.n7,
      number_infos: JSON.stringify(row.numberInfos),
    }));
    const modified = input.filter(r => r.No !== 95);
    modified.push({...input[97]});

    const result = buildColorParityObservation(modified, 'halfWave');
    expect(result.integrity.duplicatePeriods).toBe(1);
    expect(result.integrity.missingOrInvalidPeriods).toBe(2);
    expect(result.current?.vectorWindows).toHaveLength(0);
    expect(result.current?.forecasts.prior.pickLabel).toBe('绿双');
  });
});

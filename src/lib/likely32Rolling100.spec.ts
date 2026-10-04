import {describe, expect, it} from 'vitest';
import {rolling100Prediction, ROLLING100_RULE} from './likely32Rolling100';
import {buildLikely32Lab, summarizeLab, LAB_VERSION, DEFAULT_CONFIG} from './likely32Lab';
import {parseJournal, reconcileJournal} from './likely32Journal';
import type {Frozen} from './likely32Lab';
function draws(count: number) {
  let seed = 94173;
  return Array.from({length: count}, (_, i) => {
    const numbers: number[] = [];
    while (numbers.length < 7) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const n = seed % 49 + 1; if (!numbers.includes(n)) numbers.push(n);}
    return {year: 2026, No: i + 1, numbers};
  });
}
const raw = (rows: ReturnType<typeof draws>) => rows.map(r => ({year: r.year, No: r.No, ...Object.fromEntries(r.numbers.map((n, i) => [`n${i + 1}`, n]))}));

describe('fixed previous-100 learner', () => {
  it('learns only inside the previous 100 draws, with 90 causal state-outcome examples', () => {
    const history = draws(250), r = rolling100Prediction(history);
    expect(r.details.version).toBe(ROLLING100_RULE.version);
    expect(r.details.trainingCount).toBe(100);
    expect(r.details.stateSamples).toBe(90);
    expect(r.details.from?.No).toBe(151);
    expect(r.details.through?.No).toBe(250);
    expect(r.details.neighborCount).toBe(20);
    expect(r.details.ranking.reduce((s, x) => s + x.specialCount, 0)).toBe(100);
    expect(r.details.groups.reduce((s, x) => s + x.specials, 0)).toBe(90);
    expect(r.details.groups.reduce((s, x) => s + x.candidates, 0)).toBe(90 * 49);
    expect(r.picks).toHaveLength(32); expect(new Set(r.picks).size).toBe(32);
    const changedOld = history.map((r, i) => i < 150 ? {...r, numbers: [...r.numbers].reverse()} : r);
    expect(rolling100Prediction(changedOld)).toEqual(r);
    expect(rolling100Prediction(history.slice(-100))).toEqual(r);
    for (const n of r.details.neighbors) {
      expect(n.No).toBeGreaterThanOrEqual(161); expect(n.No).toBeLessThanOrEqual(250);
      expect(n.special).toBe(history[n.No - 1].numbers[6]);
      for (const other of r.details.neighbors) if (other.No !== n.No) expect(Math.abs(n.No - other.No)).toBeGreaterThanOrEqual(3);
    }
  });
  it('moves its window by exactly one draw and cannot use the target label', () => {
    const input = raw(draws(130));
    const prefix = buildLikely32Lab(input.slice(0, 120));
    const full = buildLikely32Lab(input);
    expect(full.rows.filter(r => r.No <= 120)).toEqual(prefix.rows);
    expect(full.rows.find(r => r.No === 121)?.picks.rolling100).toEqual(prefix.current.picks.rolling100);
    const changed = [...input.slice(0, 120), {...input[120], n1: input[120].n7, n7: input[120].n1}];
    expect(buildLikely32Lab(changed).rows.at(-1)?.picks.rolling100).toEqual(prefix.current.picks.rolling100);
    expect(full.rows.find(r => r.No === 122)?.rolling100.from?.No).toBe(22);
  });
  it('excludes pre-100 warmup from learning-model performance', () => {
    const lab = buildLikely32Lab(raw(draws(105)));
    expect(lab.rows.find(r => r.No === 100)?.rolling100.ready).toBe(false);
    expect(lab.rows.find(r => r.No === 101)?.rolling100.ready).toBe(true);
    expect(summarizeLab(lab.rows, 'rolling100').count).toBe(5);
    expect(summarizeLab(lab.rows.filter(r => r.No <= 100), 'rolling100').rate).toBeNull();
    expect(rolling100Prediction(draws(99)).details.ready).toBe(false);
  });
});

it('records the learning window and refuses to silently change a frozen rule version', () => {
  const history = raw(draws(106)), result = buildLikely32Lab(history.slice(0, 105));
  const frozen: Frozen = {version: LAB_VERSION, model: 'rolling100', modelVersion: ROLLING100_RULE.version, config: DEFAULT_CONFIG,
    after: {year: 2026, No: 105}, savedAt: '2026-10-04T07:00:00Z'};
  const saved = reconcileJournal([], result, frozen, frozen.savedAt);
  expect(saved[0].learning).toEqual({version: ROLLING100_RULE.version, from: {year: 2026, No: 6}, through: {year: 2026, No: 105}, trainingCount: 100, stateSamples: 90});
  expect(parseJournal(JSON.stringify(saved))).toEqual(saved);
  const next = reconcileJournal(saved, buildLikely32Lab(history), frozen, '2026-10-05T07:00:00Z');
  expect(next[0].learning).toEqual(saved[0].learning);
  expect(next[1].learning?.from.No).toBe(7);
  expect(next[0].settled?.issue.No).toBe(106);
  expect(() => reconcileJournal(saved, result, {...frozen, modelVersion: 'changed'}, frozen.savedAt)).toThrow('学习规则版本');
});

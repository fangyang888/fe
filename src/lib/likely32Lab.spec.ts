import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {parseJournal, reconcileJournal} from './likely32Journal';
import type {Frozen} from './likely32Lab';
import {describe, expect, it} from 'vitest';
import {adaptivePrediction, buildLikely32Lab, createAdaptiveState, DEFAULT_CONFIG, LAB_VERSION, MODELS, originalRanking, parseFrozen, parseLabHistory, summarizeLab, updateAdaptiveState} from './likely32Lab';

function fixture(count: number) {
  let seed = 7189;
  return Array.from({length: count}, (_, i) => {
    const numbers: number[] = [];
    while (numbers.length < 7) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed % 49 + 1;
      if (!numbers.includes(n)) numbers.push(n);
    }
    return {year: 2026, No: i + 1, ...Object.fromEntries(numbers.map((n, j) => [`n${j + 1}`, n]))};
  });
}

// Read the untouched production method as an independent parity oracle.
function legacyOracle() {
  const source = readFileSync(new URL('../../server/src/predictor/kill-combo-backtest.service.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('legacy.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(ts.isClassDeclaration)!;
  const methods = ['likely22', 'toMatrix'].map(name => declaration.members.find(m => m.name?.getText(ast) === name)!.getText(ast));
  const js = ts.transpileModule(`class Oracle {${methods.join('\n')}}`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  return new (new Function(`${js}; return Oracle;`)())();
}

describe('isolated likely32 optimization lab', () => {
  it('changes the next allocation after observed phase shifts, with at most four swaps and a warmup', () => {
    const items = Array.from({length: 49}, (_, i) => ({n: i + 1, score: 49 - i, group: i % 3, miss: i % 3, ratio: 1, overdue: 0, bucket: 0}));
    const order = items.map(x => x.n), state = createAdaptiveState();
    expect(adaptivePrediction(items, order, state).picks).toEqual(order.slice(0, 32));
    for (let i = 0; i < 80; i++) updateAdaptiveState(state, items, order.slice(0, 32), 35);
    const shifted = adaptivePrediction(items, order, state);
    expect(shifted.adaptive.swaps.length).toBeGreaterThan(0);
    expect(shifted.adaptive.swaps.length).toBeLessThanOrEqual(4);
    expect(shifted.picks).not.toEqual(order.slice(0, 32));
    const before = structuredClone(state);
    adaptivePrediction(items, order, state);
    expect(state).toEqual(before);
    for (let i = 0; i < 240; i++) updateAdaptiveState(state, items, order.slice(0, 32), 36);
    const nextPhase = adaptivePrediction(items, order, state);
    expect(nextPhase.adaptive.recentShares[2]).toBeGreaterThan(shifted.adaptive.recentShares[2]);
    expect(nextPhase.picks).not.toEqual(shifted.picks);
    expect(nextPhase.adaptive.swaps.every(s => s.toGroup === 2)).toBe(true);
  });
  it('matches original service rankings on multiple rolling prefixes', () => {
    const history = parseLabHistory(fixture(160)), oracle = legacyOracle();
    for (let t = 10; t < history.length; t += 3) {
      expect(originalRanking(history.slice(0, t)).slice(0, 32)).toEqual(oracle.likely22(history.slice(0, t), 32));
    }
  });
  it('never changes past predictions when future data is added, and current picks become the next row', () => {
    const input = fixture(95), prefix = buildLikely32Lab(input.slice(0, 70)), full = buildLikely32Lab(input);
    expect(full.rows.filter(r => r.No <= 70)).toEqual(prefix.rows);
    expect(full.rows.find(r => r.No === 71)?.picks).toEqual(prefix.current.picks);
    const changed = [...input.slice(0, 70), {...input[70], n7: input[70].n1, n1: input[70].n7}];
    expect(buildLikely32Lab(changed).rows.at(-1)?.picks).toEqual(prefix.current.picks);
  });
  it('always selects 32 unique valid numbers and uses special-code coverage as its outcome', () => {
    const r = buildLikely32Lab(fixture(120));
    for (const row of r.rows) for (const model of MODELS) {
      expect(row.picks[model]).toHaveLength(32);
      expect(new Set(row.picks[model]).size).toBe(32);
      expect(row.picks[model].every(n => n >= 1 && n <= 49)).toBe(true);
      expect(row.hits[model]).toBe(row.picks[model].includes(row.special));
      expect(row.selectedGroups[model].reduce((a, b) => a + b, 0)).toBe(32);
    }
    const summary = summarizeLab(r.rows, 'learned');
    expect(summary.hits - summary.originalHits).toBe(summary.gains - summary.losses);
    expect(summarizeLab([], 'smooth').rate).toBeNull();
  });
  it('keeps baseline unchanged across experiments and zero smoothing reproduces original', () => {
    const input = fixture(90), a = buildLikely32Lab(input), b = buildLikely32Lab(input, {smoothWeight: 0, prior: 49, lookback: 20});
    expect(b.rows.map(r => r.picks.original)).toEqual(a.rows.map(r => r.picks.original));
    for (const r of b.rows) expect(r.picks.smooth).toEqual(r.picks.original);
    expect(b.learnedSamples).toBe(20);
  });
  it('rejects gaps, duplicates, invalid draws, and malformed parameters instead of fabricating statistics', () => {
    const input = fixture(20);
    expect(() => buildLikely32Lab([])).toThrow('至少');
    expect(() => buildLikely32Lab({records: input})).toThrow('数组');
    expect(() => buildLikely32Lab(input.filter(r => r.No !== 13))).toThrow('缺期');
    expect(() => buildLikely32Lab([...input, input[0]])).toThrow('重复');
    expect(() => buildLikely32Lab([{...input[0], n7: 50}, ...input.slice(1)])).toThrow('无效');
    expect(() => buildLikely32Lab(input, {...DEFAULT_CONFIG, smoothWeight: NaN})).toThrow('参数');
    expect(buildLikely32Lab([...input].reverse()).rows).toEqual(buildLikely32Lab(input).rows);
  });
  it('restores only valid frozen versions and settings', () => {
    const valid = {version: LAB_VERSION, model: 'learned', config: DEFAULT_CONFIG, after: {year: 2026, No: 275}, savedAt: '2026-10-03T10:00:00Z'};
    expect(parseFrozen(JSON.stringify(valid))).toEqual(valid);
    expect(parseFrozen(JSON.stringify({...valid, version: 'old'}))).toBeNull();
    expect(parseFrozen(JSON.stringify({...valid, after: null}))).toBeNull();
    expect(parseFrozen('bad')).toBeNull();
  });
});


describe('prospective prediction journal', () => {
  const frozen: Frozen = {version: LAB_VERSION, model: 'adaptive', config: DEFAULT_CONFIG, after: {year: 2026, No: 70}, savedAt: '2026-10-04T01:00:00Z'};
  it('settles saved picks only, does not fabricate missed forecasts, and preserves snapshots after history corrections', () => {
    const input = fixture(75), initial = buildLikely32Lab(input.slice(0, 70));
    const saved = reconcileJournal([], initial, frozen, frozen.savedAt);
    expect(saved).toHaveLength(1);
    expect(saved[0].picks).toEqual(initial.current.picks.adaptive);
    expect(reconcileJournal(saved, initial, frozen, frozen.savedAt)).toEqual(saved);
    const refreshed = reconcileJournal(saved, buildLikely32Lab(input), frozen, '2026-10-05T01:00:00Z');
    expect(refreshed).toHaveLength(2);
    expect(refreshed[0].settled?.issue.No).toBe(71);
    expect(refreshed[0].settled?.hit).toBe(saved[0].picks.includes(input[70].n7));
    expect(refreshed[1].after.No).toBe(75);
    expect(refreshed[1].settled).toBeNull();
    expect(saved[0].settled).toBeNull();
    const changed = input.map((r, i) => i === 70 ? {...r, n1: r.n7, n7: r.n1} : r);
    const corrected = reconcileJournal(refreshed, buildLikely32Lab(changed), frozen, '2026-10-06T01:00:00Z');
    expect(corrected[0].historyChanged).toBe(true);
    expect(corrected[0].settled).toEqual(refreshed[0].settled);
    expect(corrected[0].picks).toEqual(saved[0].picks);
    expect(corrected[1].picks).toEqual(refreshed[1].picks);
    expect(parseJournal(JSON.stringify(corrected))).toEqual(corrected);
  });
  it('rejects malformed records and refuses a different frozen rule or a stale history', () => {
    const result = buildLikely32Lab(fixture(70));
    const saved = reconcileJournal([], result, frozen, frozen.savedAt);
    expect(() => parseJournal('bad')).toThrow();
    expect(() => parseJournal(JSON.stringify([saved[0], saved[0]]))).toThrow();
    expect(() => parseJournal(JSON.stringify([{...saved[0], picks: [1, 1]}]))).toThrow();
    expect(() => reconcileJournal(saved, {...result, config: {...DEFAULT_CONFIG, smoothWeight: 0}}, frozen, frozen.savedAt)).toThrow('配置');
    expect(() => reconcileJournal(saved, buildLikely32Lab(fixture(69)), frozen, frozen.savedAt)).toThrow('早于');
  });
  it('preserves archived runs and never backfills forecasts when upgrading an existing freeze', () => {
    const result = buildLikely32Lab(fixture(75));
    const records = reconcileJournal([], result, frozen, frozen.savedAt);
    expect(records).toHaveLength(1);
    expect(records[0].after.No).toBe(75);
    expect(records[0].settled).toBeNull();
    const newRun = {...frozen, savedAt: '2026-10-06T01:00:00Z', after: result.latest};
    const both = reconcileJournal(records, result, newRun, newRun.savedAt);
    expect(both).toHaveLength(2);
    expect(both[0]).toEqual(records[0]);
  });
});

describe('spaced vector neighbors', () => {
  it('uses causal, separated neighbors and preserves forecasts once vector warmup has completed', () => {
    const input = fixture(330), prefix = buildLikely32Lab(input.slice(0, 300)), full = buildLikely32Lab(input);
    expect(prefix.current.vector.neighborCount).toBe(40);
    expect(prefix.current.vector.effectiveNeighbors).toBeGreaterThan(0);
    const neighbors = prefix.current.vector.neighbors;
    expect(neighbors).toHaveLength(10);
    for (let i = 0; i < neighbors.length; i++) {
      expect(301 - neighbors[i].No).toBeGreaterThanOrEqual(5);
      for (let j = i + 1; j < neighbors.length; j++) expect(Math.abs(neighbors[i].No - neighbors[j].No)).toBeGreaterThanOrEqual(5);
    }
    expect(full.rows.filter(r => r.No <= 300)).toEqual(prefix.rows);
    expect(full.rows.find(r => r.No === 301)?.picks).toEqual(prefix.current.picks);
    const changed = [...input.slice(0, 300), {...input[300], n1: input[300].n7, n7: input[300].n1}];
    expect(buildLikely32Lab(changed).rows.at(-1)?.picks).toEqual(prefix.current.picks);
    for (const row of full.rows) {
      const replacements = row.picks.vector.filter(n => !row.picks.original.includes(n));
      expect(replacements.length).toBeLessThanOrEqual(4);
      expect(row.picks.vectorGuard).toEqual(row.vector.guardActive ? row.picks.vector : row.picks.original);
    }
    expect(full.rows.some(r => r.vector.swaps.length > 0)).toBe(true);
  });
});

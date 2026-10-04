import {expect, it} from 'vitest';
import {learnVectorSwaps, rememberVectorSwaps, VECTOR_LEARNING_RULE} from './likely32VectorLearning';
import type {VectorLearningRecord} from './likely32VectorLearning';
import {buildLikely32Lab, summarizeLab, DEFAULT_CONFIG, LAB_VERSION} from './likely32Lab';
import {reconcileJournal, parseJournal} from './likely32Journal';
const original = Array.from({length: 32}, (_, i) => i + 1);
const swaps = [1, 2, 3, 4].map(from => ({from, to: from + 32}));
const record = (No: number, special: number): VectorLearningRecord => ({year: 2026, No, special, swaps});
it('learns each candidate position from a fixed past window and retains exactly 32 unique numbers', () => {
  const history = Array.from({length: 100}, (_, i) => record(i + 1, i < 4 ? 33 : i < 8 ? 2 : 49));
  const before = JSON.stringify(history), r = learnVectorSwaps(original, swaps, history);
  expect(r.details.slots.map(s => s.enabled)).toEqual([true, false, false, false]);
  expect(r.details.slots[0].support).toBe(5 / 6);
  expect(r.picks).toEqual([33, ...original.slice(1)]);
  expect(new Set(r.picks).size).toBe(32);
  expect(JSON.stringify(history)).toBe(before);
  expect(learnVectorSwaps(original, swaps, history.slice(1)).picks).toEqual(original);
  expect(learnVectorSwaps(original, swaps, [record(0, 1), ...history])).toEqual(r);
  // Disabled proposals are still learned after every outcome; a regime can reverse.
  for (let i = 101; i <= 200; i++) rememberVectorSwaps(history, {year: 2026, No: i, numbers: [5,6,7,8,9,10,34]}, swaps);
  expect(history).toHaveLength(100);
  expect(learnVectorSwaps(original, swaps, history).details.slots.map(s => s.enabled)).toEqual([false, true, false, false]);
});
it('requires four decisive outcomes and the fixed smoothed support threshold', () => {
  const run = (gains: number, losses: number) => learnVectorSwaps(original, swaps, Array.from({length:100}, (_,i)=>record(i+1,i<gains?33:i<gains+losses?1:49)));
  expect(run(3,0).details.slots[0].enabled).toBe(false);
  expect(run(3,1).details.slots[0].enabled).toBe(true);
  expect(run(2,2).details.slots[0].enabled).toBe(false);
});
function raw(count: number) {
  let seed = 94173;
  return Array.from({length: count}, (_, i) => {
    const numbers: number[] = [];
    while(numbers.length<7) {seed=(Math.imul(seed,1664525)+1013904223)>>>0; const n=seed%49+1; if(!numbers.includes(n)) numbers.push(n);}
    return {year:2026, No:i+1,...Object.fromEntries(numbers.map((n,j)=>[`n${j+1}`,n]))};
  });
}
it('predicts before learning the target and excludes warmup, preserving versioned snapshots', () => {
  const history = raw(260), prefix = buildLikely32Lab(history.slice(0,250)), full = buildLikely32Lab(history);
  expect(full.rows.filter(r=>r.No<=250)).toEqual(prefix.rows);
  expect(full.rows.find(r=>r.No===251)?.picks.vectorLearn).toEqual(prefix.current.picks.vectorLearn);
  const altered = history.slice(0,251).map((r,i)=>i===250?{...r,n1:r.n7,n7:r.n1}:r);
  expect(buildLikely32Lab(altered).rows.at(-1)?.picks.vectorLearn).toEqual(prefix.current.picks.vectorLearn);
  expect(summarizeLab(full.rows.filter(r=>r.No<=110),'vectorLearn').count).toBe(0);
  expect(summarizeLab(full.rows.filter(r=>r.No<=111),'vectorLearn').count).toBe(1);
  const frozen = {version:LAB_VERSION, model:'vectorLearn' as const,modelVersion:VECTOR_LEARNING_RULE.version,config:DEFAULT_CONFIG,after:{year:2026,No:250},savedAt:'2026-10-04T09:00:00Z'};
  const saved = reconcileJournal([],prefix,frozen,frozen.savedAt);
  expect(saved[0].vectorLearning?.from.No).toBe(151);
  expect(parseJournal(JSON.stringify(saved))).toEqual(saved);
  const next = reconcileJournal(saved,full,frozen,frozen.savedAt);
  expect(next[0].vectorLearning).toEqual(saved[0].vectorLearning);
  expect(next[1].vectorLearning?.from.No).toBe(161);
  expect(next[0].settled?.issue.No).toBe(251);
  expect(()=>reconcileJournal(saved,prefix,{...frozen,modelVersion:'changed'},frozen.savedAt)).toThrow('学习规则版本');
});

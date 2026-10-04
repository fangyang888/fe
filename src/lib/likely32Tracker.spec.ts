import {describe, expect, it, vi} from 'vitest';
import {compactTracker, missStreaks, trackerStats} from './likely32Tracker';
import type {TrackerRow} from './likely32Tracker';
import {parseTrackerCache, serializeTrackerCache, trackerFingerprint} from './likely32TrackerCache';
import {buildLikely32Lab} from './likely32Lab';
const row = (No: number, hit: boolean, ready = true, year = 2026): TrackerRow => ({year, No, special: 1, picks: {vector: [], vectorLearn: []}, hits: {vector: hit, vectorLearn: hit}, vectorLearning: {ready}});
function fixture(count: number) {
  let seed = 94173;
  return Array.from({length: count}, (_, i) => {
    const numbers: number[] = [];
    while (numbers.length < 7) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const n = seed % 49 + 1; if (!numbers.includes(n)) numbers.push(n);}
    return {year: 2026, No: i + 1, ...Object.fromEntries(numbers.map((n, j) => [`n${j + 1}`, n]))};
  });
}

describe('tracker consecutive misses', () => {
  it('marks closed and ongoing runs and resets on a hit', () => {
    const s = missStreaks([row(1,false),row(2,false),row(3,true),row(4,false),row(5,false),row(6,false)], 'vector');
    expect(s.current).toBe(3); expect(s.longest).toBe(3);
    expect(s.runs.map(r => [r.from.No,r.through.No,r.length,r.ongoing])).toEqual([[1,2,2,false],[4,6,3,true]]);
    expect(s.byIssue['2026-5']).toBe(2); expect(s.byIssue['2026-3']).toBe(0);
    expect(missStreaks([row(1,false),row(2,true)], 'vector').runs).toHaveLength(0);
  });
  it('excludes warmup, breaks on missing periods, and handles year boundaries', () => {
    const rows = [row(1,false,false),row(2,false,false),row(3,false),row(4,true),row(6,false),row(7,false)];
    expect(missStreaks(rows,'vectorLearn').runs.map(r => r.from.No)).toEqual([6]);
    expect(trackerStats(rows,'vectorLearn')).toEqual({count:4,hits:1});
    expect(missStreaks([row(1,false),row(3,false)],'vector').longest).toBe(1);
    expect(missStreaks([row(365,false,true,2025),row(1,false)],'vector').current).toBe(2);
  });
  it('preserves a full-history streak across the visible 20-period boundary', () => {
    const rows = Array.from({length:25},(_,i)=>row(i+1,false));
    expect(missStreaks(rows,'vector').byIssue['2026-6']).toBe(6);
    expect(missStreaks(rows.slice(-20),'vector').longest).toBe(20);
    expect(missStreaks(rows,'vector').longest).toBe(25);
  });
});

describe('compact versioned tracker cache', () => {
  it('round trips full history and detects old-period correction or algorithm changes', async () => {
    const raw = fixture(115), lab = buildLikely32Lab(raw), compact = compactTracker(lab);
    const {fingerprint,history} = await trackerFingerprint(raw,'worker-v1');
    const serialized = serializeTrackerCache(fingerprint, compact);
    expect(serialized.length).toBeLessThan(JSON.stringify(lab).length / 2);
    expect(parseTrackerCache(serialized,fingerprint,history)).toEqual(compact);
    for (const m of ['vector','vectorLearn'] as const) {
      expect(compact.current.picks[m]).toEqual(lab.current.picks[m]);
      expect(compact.rows.map(r=>r.picks[m])).toEqual(lab.rows.map(r=>r.picks[m]));
    }
    expect((await trackerFingerprint([...raw].reverse(),'worker-v1')).fingerprint).toBe(fingerprint);
    const correction = raw.map((r,i)=>i===0?{...r,n1:r.n7,n7:r.n1}:r);
    const corrected = await trackerFingerprint(correction,'worker-v1');
    expect(corrected.fingerprint).not.toBe(fingerprint);
    expect(parseTrackerCache(serialized,corrected.fingerprint,corrected.history)).toBeNull();
    const updated = await trackerFingerprint(raw,'worker-v2');
    expect(parseTrackerCache(serialized,updated.fingerprint,history)).toBeNull();
    const damaged = JSON.parse(serialized); damaged.result.rows[0].picks.vector[0] = damaged.result.rows[0].picks.vector[1];
    expect(parseTrackerCache(JSON.stringify(damaged),fingerprint,history)).toBeNull();
    expect(parseTrackerCache('{broken',fingerprint,history)).toBeNull();
    expect(parseTrackerCache(null,fingerprint,history)).toBeNull();
  });
  it('also fingerprints on plain HTTP where Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const raw = fixture(12), first = await trackerFingerprint(raw,'engine');
      expect(first.fingerprint).toMatch(/^fnv64:/);
      expect((await trackerFingerprint(raw,'engine')).fingerprint).toBe(first.fingerprint);
      await expect(trackerFingerprint([],'engine')).rejects.toThrow('至少需要11期');
    } finally {vi.unstubAllGlobals();}
  });
});

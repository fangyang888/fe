import {DEFAULT_CONFIG, LAB_VERSION, parseLabHistory} from './likely32Lab';
import {VECTOR_VERSION} from './likely32Vector';
import {VECTOR_LEARNING_RULE} from './likely32VectorLearning';
import type {TrackerResult} from './likely32Tracker';
import {TRACKER_MODELS} from './likely32Tracker';
export const TRACKER_CACHE_KEY = 'likely32-vector-tracker:cache:v1';
const SCHEMA = 1;
export async function trackerFingerprint(input: unknown, engineUrl: string) {
  const history = parseLabHistory(input);
  if (history.length < 11) throw new Error('至少需要11期连续历史才能开始实验');
  const text = JSON.stringify([SCHEMA, LAB_VERSION, VECTOR_VERSION, VECTOR_LEARNING_RULE.version, DEFAULT_CONFIG, engineUrl, history]);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return {fingerprint: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), history};
  }
  // HTTP deployments may lack Web Crypto. This is a cache identity, not an authentication signature.
  let hash = 14695981039346656037n;
  for (const char of text) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  return {fingerprint: `fnv64:${text.length}:${hash.toString(16)}`, history};
}
export function serializeTrackerCache(fingerprint: string, result: TrackerResult) {
  return JSON.stringify({schema: SCHEMA, fingerprint, savedAt: new Date().toISOString(), result});
}
export function parseTrackerCache(text: string | null, fingerprint: string, history: ReturnType<typeof parseLabHistory>): TrackerResult | null {
  try {
    if (!text) return null;
    const cache = JSON.parse(text);
    if (cache.schema !== SCHEMA || cache.fingerprint !== fingerprint || !Number.isFinite(Date.parse(cache.savedAt))) return null;
    const r = cache.result as TrackerResult;
    const last = history.at(-1)!;
    if (!r || r.latest.year !== last.year || r.latest.No !== last.No || !Array.isArray(r.rows) || r.rows.length !== history.length - 10) return null;
    const validPicks = (picks: number[]) => Array.isArray(picks) && picks.length === 32 && new Set(picks).size === 32 && picks.every(n => Number.isInteger(n) && n >= 1 && n <= 49);
    if (!TRACKER_MODELS.every(m => validPicks(r.current.picks[m])) ||
      r.current.vectorLearning.trainingCount !== Math.min(history.length - 10, 100) || r.current.vectorLearning.ready !== (history.length >= 110)) return null;
    for (let i = 0; i < r.rows.length; i++) {
      const row = r.rows[i], actual = history[i + 10];
      if (row.year !== actual.year || row.No !== actual.No || row.special !== actual.numbers[6] || row.vectorLearning.ready !== (i >= 100)) return null;
      for (const m of TRACKER_MODELS) if (!validPicks(row.picks[m]) || row.hits[m] !== row.picks[m].includes(row.special)) return null;
    }
    return r;
  } catch {return null;}
}

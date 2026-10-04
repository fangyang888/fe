import type {LabResult} from './likely32Lab';
export type TrackerModel = 'vectorLearn' | 'vector';
export const TRACKER_MODELS: TrackerModel[] = ['vectorLearn', 'vector'];
type Issue = {year: number; No: number};
export type TrackerRow = Issue & {
  special: number; picks: Record<TrackerModel, number[]>; hits: Record<TrackerModel, boolean>;
  vectorLearning: {ready: boolean};
};
export type TrackerResult = {
  latest: Issue; rows: TrackerRow[];
  current: {picks: Record<TrackerModel, number[]>; vectorLearning: {ready: boolean; trainingCount: number}};
};
export const issueKey = (r: Issue) => `${r.year}-${r.No}`;
const issue = (r: Issue) => ({year: r.year, No: r.No});
export function compactTracker(result: LabResult): TrackerResult {
  const picks = (p: LabResult['current']['picks']) => ({vectorLearn: p.vectorLearn, vector: p.vector});
  return {latest: issue(result.latest), current: {picks: picks(result.current.picks),
    vectorLearning: {ready: result.current.vectorLearning.ready, trainingCount: result.current.vectorLearning.trainingCount}},
    rows: result.rows.map(r => ({...issue(r), special: r.special, picks: picks(r.picks),
      hits: {vectorLearn: r.hits.vectorLearn, vector: r.hits.vector}, vectorLearning: {ready: r.vectorLearning.ready}}))};
}
export function trackerStats(rows: TrackerRow[], model: TrackerModel) {
  const eligible = rows.filter(r => model !== 'vectorLearn' || r.vectorLearning.ready);
  return {count: eligible.length, hits: eligible.filter(r => r.hits[model]).length};
}
export function missStreaks(rows: TrackerRow[], model: TrackerModel) {
  const runs: {from: Issue; through: Issue; length: number; ongoing: boolean}[] = [];
  const byIssue: Record<string, number> = {};
  let current = 0, longest = 0, eligibleCount = 0, from: Issue | null = null, previous: TrackerRow | null = null;
  const finish = (ongoing: boolean) => {
    if (current >= 2 && from && previous) runs.push({from, through: issue(previous), length: current, ongoing});
  };
  for (const row of rows) {
    const adjacent = !previous || (row.year === previous.year && row.No === previous.No + 1) || (row.year === previous.year + 1 && row.No === 1);
    if (!adjacent || model === 'vectorLearn' && !row.vectorLearning.ready) {
      finish(false); current = 0; from = null;
    }
    if (model !== 'vectorLearn' || row.vectorLearning.ready) {
      eligibleCount++;
      if (row.hits[model]) {finish(false); current = 0; from = null;}
      else {if (!current) from = issue(row); current++; longest = Math.max(longest, current);}
    }
    byIssue[issueKey(row)] = current;
    previous = row;
  }
  finish(true);
  return {current, longest, eligibleCount, runs, byIssue};
}

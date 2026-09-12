import { buildPeakObservation, isPeak, PEAK_WINDOWS, summarizePeak } from './peakObservation';
import type { PeakDraw, PeakRow } from './peakObservation';

export const THREE_PATHS = [
  { key: 'low-peak-05', name: 'N3 低位山峰', number: 5, position: 3, length: 3, rule: '第3个号码先升后降，最后一个数不大于16。' },
  { key: 'peak-28', name: 'N6 山峰', number: 28, position: 6, length: 3, rule: '第6个号码先升后降，持平不算触发。' },
  { key: 'zigzag-20', name: 'N5 升降升', number: 20, position: 5, length: 4, rule: '第5个号码连续四期呈升 → 降 → 升。' },
] as const;
type PathDefinition = (typeof THREE_PATHS)[number];
type PathKey = PathDefinition['key'];
export type PathState = { definition: PathDefinition; sources: PeakDraw[]; values: number[]; state: PeakRow['state'] };
export type ThreePathDecision = { state: PeakRow['state']; selected: PathState | null; paths: PathState[]; sources: PeakDraw[] };
export type ThreePathRow = PeakRow & { decision: ThreePathDecision; number: number | null };
const OLD_ORDER: PathKey[] = ['peak-28', 'low-peak-05', 'zigzag-20'];

function decide(byNo: Map<number, PeakDraw>, end: number | null, oldOrder = false): ThreePathDecision {
  const paths: PathState[] = THREE_PATHS.map(definition => {
    const sources = end === null ? [] : Array.from({ length: definition.length }, (_, i) => byNo.get(end - definition.length + 1 + i)).filter((d): d is PeakDraw => Boolean(d));
    const values = sources.map(d => d.numbers[definition.position - 1]);
    const complete = sources.length === definition.length;
    const triggered = complete && (definition.key === 'zigzag-20'
      ? values[0] < values[1] && values[1] > values[2] && values[2] < values[3]
      : isPeak(values) && (definition.key !== 'low-peak-05' || values[2] <= 16));
    return { definition, sources, values, state: complete ? triggered ? 'triggered' : 'not-triggered' : 'incomplete' };
  });
  const ordered = oldOrder ? OLD_ORDER.map(key => paths.find(p => p.definition.key === key)!) : paths;
  for (const path of ordered) {
    // A missing higher-priority state cannot be treated as false to choose a lower rule.
    if (path.state === 'incomplete') return { paths, state: 'incomplete', selected: null, sources: [] };
    if (path.state === 'triggered') return { paths, state: 'triggered', selected: path, sources: path.sources };
  }
  return { paths, state: 'not-triggered', selected: null, sources: [] };
}

export function buildThreePathObservation(input: unknown) {
  // Reuse the observation page's validation and duplicate/gap handling, not its predictions.
  const history = buildPeakObservation(input);
  const byNo = new Map(history.draws.map(d => [d.No, d]));
  const makeRows = (oldOrder: boolean): ThreePathRow[] => history.draws.filter(draw => draw.No >= 5).map(draw => {
    const decision = decide(byNo, draw.No - 1, oldOrder);
    const number = decision.selected?.definition.number ?? null;
    return { draw, decision, sources: decision.sources, state: decision.state, number,
      success: number === null ? null : !draw.numbers.includes(number),
      specialCodeMiss: number === null ? null : draw.numbers[6] !== number };
  });
  const rows = makeRows(false);
  const oldRows = makeRows(true);
  const comparisonRows = rows.filter(r => r.draw.No >= 151 && r.draw.No <= 253);
  const oldComparisonRows = oldRows.filter(r => r.draw.No >= 151 && r.draw.No <= 253);
  const rangeDefinitions = [
    { label: '前段研究 · 5～150期', min: 5, max: 150 },
    { label: '顺序筛选 · 151～200期', min: 151, max: 200 },
    { label: '末段回看 · 201～253期', min: 201, max: 253 },
    { label: '后续观察 · 255期起', min: 255, max: Infinity },
  ];
  return {
    latestNo: history.latestNo, validCount: history.draws.length, integrity: history.integrity,
    rows, current: decide(byNo, history.latestNo), total: summarizePeak(rows),
    comparison: summarizePeak(comparisonRows), oldComparison: summarizePeak(oldComparisonRows),
    comparisonPeriodCount: comparisonRows.length,
    comparisonUnknownCount: comparisonRows.filter(r => r.state === 'incomplete').length,
    ranges: rangeDefinitions.map(r => ({ label: r.label, ...summarizePeak(rows.filter(row => row.draw.No >= r.min && row.draw.No <= r.max)) })),
    windows: PEAK_WINDOWS.map(window => ({ window, ...summarizePeak(rows.filter(r => history.latestNo !== null && r.draw.No > history.latestNo - window)) })),
  };
}
export type ThreePathObservationData = ReturnType<typeof buildThreePathObservation>;

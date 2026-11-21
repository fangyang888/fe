// Snapshot the existing learning thresholds for this fixed trial.
export const FUSION_GATE_RULE = {
  version: 'qwen-fusion-gate-v1',
  after: {year: 2026, No: 323},
  qwenWeight: 0.75,
  window: 100,
  minimumDecisions: 4,
  support: 0.6,
  priorWins: 1,
  priorLosses: 1,
} as const;

type Comparison = {vector: boolean; fusion: boolean};

export function decideFusion(previous: Comparison[]) {
  const {window, minimumDecisions, support: threshold, priorWins, priorLosses} = FUSION_GATE_RULE;
  const recent = previous.slice(-window);
  const gains = recent.filter(row => row.fusion && !row.vector).length;
  const losses = recent.filter(row => !row.fusion && row.vector).length;
  const disagreements = gains + losses;
  const support = (gains + priorWins) / (disagreements + priorWins + priorLosses);
  return {count: recent.length, gains, losses, support,
    enabled: recent.length === window && disagreements >= minimumDecisions && support >= threshold};
}

export function replayFusionGate<T extends Comparison>(rows: T[]) {
  return {
    rows: rows.map((row, index) => {
      const decision = decideFusion(rows.slice(Math.max(0, index - FUSION_GATE_RULE.window), index));
      return {...row, enabled: decision.enabled, hit: decision.enabled ? row.fusion : row.vector};
    }),
    current: decideFusion(rows),
  };
}

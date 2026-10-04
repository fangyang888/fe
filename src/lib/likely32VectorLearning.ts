// One fixed learning rule, specified before evaluating its replay performance.
// Learn candidate-swap positions, not particular number identities.
export const VECTOR_LEARNING_RULE = {version: 'vector-learning100-v1', window: 100, minimumDecisions: 4, support: 0.6, priorWins: 1, priorLosses: 1} as const;
type Issue = {year: number; No: number};
type Swap = {from: number; to: number};
export type VectorLearningRecord = Issue & {special: number; swaps: Swap[]};
export type VectorLearningDetails = {
  version: string; ready: boolean; trainingCount: number; from: Issue | null; through: Issue | null;
  slots: {position: number; appearances: number; gains: number; losses: number; support: number; enabled: boolean; proposal: Swap | null; reason: string}[];
};
const issue = (r: Issue): Issue => ({year: r.year, No: r.No});
export function learnVectorSwaps(original: number[], proposals: Swap[], records: VectorLearningRecord[]) {
  const training = records.slice(-VECTOR_LEARNING_RULE.window), ready = training.length === VECTOR_LEARNING_RULE.window;
  const slots = Array.from({length: 4}, (_, index) => {
    let appearances = 0, gains = 0, losses = 0;
    for (const row of training) {
      const swap = row.swaps[index];
      if (!swap) continue;
      appearances++; gains += Number(row.special === swap.to); losses += Number(row.special === swap.from);
    }
    const support = (gains + VECTOR_LEARNING_RULE.priorWins) / (gains + losses + VECTOR_LEARNING_RULE.priorWins + VECTOR_LEARNING_RULE.priorLosses);
    const proposal = proposals[index] ? {...proposals[index]} : null;
    const reason = !ready ? '不足100期' : !proposal ? '本期无候选' : gains + losses < VECTOR_LEARNING_RULE.minimumDecisions ? '救回/损失样本不足4次'
      : support < VECTOR_LEARNING_RULE.support ? '历史支持度不足60%' : '历史支持度达标';
    return {position: index + 1, appearances, gains, losses, support, proposal, reason,
      enabled: ready && !!proposal && gains + losses >= VECTOR_LEARNING_RULE.minimumDecisions && support >= VECTOR_LEARNING_RULE.support};
  });
  const picks = [...original];
  for (const slot of slots) if (slot.enabled && slot.proposal) picks[picks.indexOf(slot.proposal.from)] = slot.proposal.to;
  const details: VectorLearningDetails = {version: VECTOR_LEARNING_RULE.version, ready, trainingCount: training.length,
    from: training.length ? issue(training[0]) : null, through: training.length ? issue(training[training.length - 1]) : null, slots};
  return {picks, details};
}
export function rememberVectorSwaps(records: VectorLearningRecord[], actual: Issue & {numbers: number[]}, proposals: Swap[]) {
  records.push({...issue(actual), special: actual.numbers[6], swaps: proposals.map(s => ({from: s.from, to: s.to}))});
  if (records.length > VECTOR_LEARNING_RULE.window) records.shift();
}

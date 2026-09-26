import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { TARGET_CONFIGS, runTargetSix } from './target-six.mjs';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const nums = (v) => v.map((n) => String(n).padStart(2, '0')).join('、');
const labels = { 'frequency-30': '原近30期频率对照', 'logistic-l2-0.1': '此前排除6个的验证选定模型',
  'direct-rank-c0.05': '直接排除排序 C=0.05', 'direct-rank-c0.2': '直接排除排序 C=0.2',
  'listwise-mlp-8': '8单元神经网络', 'listwise-mlp-16': '16单元神经网络',
  'previous-normal-six': '排除上一期前6个', 'previous-last-six': '排除上一期后6个' };

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special6-target-models-2025-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (files.length) throw new Error('输出目录非空，拒绝覆盖既有实验');
  const snapshot = await readFile(resolve('analysis/special10-expanded-2025-2026/snapshot.json'));
  const rows = JSON.parse(snapshot);
  const priorText = await readFile(resolve('analysis/special6-expanded-2025-2026/results.json'), 'utf8');
  const previous = JSON.parse(priorText);
  assert.equal(sha(snapshot), previous.protocol.dataSha256);
  assert.equal(rows.length, 631);
  assert.ok(rows.slice(0, 365).every((r) => r.year === 2025));
  assert.ok(rows.slice(365).every((r) => r.year === 2026));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: sha(snapshot),
    priorResultsSha256: sha(priorText),
    moduleSha256: sha(await readFile(new URL('./target-six.mjs', import.meta.url))),
    runnerSha256: sha(await readFile(new URL('./run-target-six.mjs', import.meta.url))),
    predictionTime: 'Before any of the target draw numbers are revealed.',
    newConfigs: TARGET_CONFIGS, frozenControls: ['frequency-30', 'logistic-l2-0.1'],
    ruleControls: ['previous-normal-six', 'previous-last-six'],
    warmup: 30, trainEnd: 245, validationEnd: 365,
    training: '2025/001–245', validation: '2025/246–365', evaluation: '2026/001–266',
    selection: 'Maximum six-exclusion successes in 2025 validation only. Ties prefer controls, then declaration order.',
    ranking: 'PA-inspired custom pairwise update raises the true label above the sixth-lowest other candidate, with fixed margin and capped step. This is not a proven 100% rule.',
    neural: 'Shared 12-input tanh hidden layer, scalar score per candidate, softmax across 49 candidates, one cross-entropy target per draw, L2 regularization, fixed initialization. Scores are not calibrated probabilities.',
    evaluationCaveat: 'Exploratory repeated use of previously examined 2026 data; no fresh holdout and no future guarantee.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  const fresh = runTargetSix(rows);
  const controls = protocol.frozenControls.map((id) => {
    const r = previous.results.find((x) => x.id === id);
    assert.ok(r);
    return { id, family: 'frozen-control', validation: r.validation, evaluation: r.evaluation,
      next: r.next, details: r.details };
  });
  const results = [...controls, ...fresh.results];
  const selected = [...results].sort((a, b) => b.validation.successes - a.validation.successes)[0];
  const report = { protocol, selectedId: selected.id, selectedNewId: fresh.selectedNewId, results };
  const s = selected.evaluation;
  const text = `# 排除6个：直接排序与小型神经网络实验\n\n` +
    `预测时间仍是整期开奖前。数据为2025年365期＋2026年266期；前245期训练，2025年后120期选配置，再按时间逐期计算2026年。每期都输出6个号码，全部避开特别码才成功。\n\n` +
    `## 本轮比较\n\n| 方法 | 2025验证成功 | 2026成功 | 2026成功率 | 2026失败 |\n|---|---:|---:|---:|---:|\n` +
    results.map((r) => `| ${labels[r.id]}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/120 | ${r.evaluation.successes}/266 | ${pct(r.evaluation.rate)} | ${r.evaluation.failures} |`).join('\n') +
    `\n\n仅看2025验证段选定 **${labels[selected.id]}**；2026成功 **${s.successes}/266（${pct(s.rate)}）**，失败 **${s.failures}期**。随机排除6个的理论基线为43/49＝**87.76%**。95% Wilson区间${pct(s.ci95[0])}～${pct(s.ci95[1])}，相对随机基线的单侧二项检验p=${s.pAgainstRandom.toFixed(4)}。\n\n` +
    `所有2026年结果都属于探索性分析。这批数据已用于多轮挑选方法，不能把本轮或历轮最高分称作新数据验证，不根据2026成绩更换验证选定模型。\n\n` +
    `## 新方法与限制\n\n` +
    `1. 直接排除排序：给49个候选评分，以真实特别码和其余号码中第6低分者作比较，仅在安全边界不足时更新；步长有上限并做权重衰减。它直接针对误排风险训练，是自定义的PA式排序方法，不能继承未经验证的理论保证。\n` +
    `2. 小型神经网络：每个号码使用12维历史特征，共享8或16个tanh隐藏单元，49个候选一起做softmax训练，能表示特征组合。固定种子、正则化和轮数，没有通过反复换种子挑最好结果。\n` +
    `3. 上期六码规则：作为低复杂度对照，仅使用上一期已知号码，不能与当期前6个号码混淆。\n\n` +
    `已有631期快照内同一期7个号码均不重复；后端DTO也要求不重复。但当前spider只有收齐7个号码才保存记录，/history不是部分开奖实时接口。只有实际规则确实不重复、且当期前6个已经可靠获知时，才能按规则直接排除那6个；不能在整期开奖前拿它们计算预测成功率。\n\n` +
    `## 下一期实验结果\n\n截至2026年第266期，此后下一期的实验排除6码：**${nums(selected.next.ascending6)}**。模型为${selected.id}，不是保证不会开出的号码。\n\n` +
    `## 复现与参考\n\n\`node scripts/special15/run-target-six.mjs /tmp/special6-target-reproduction\`\n\n` +
    `模型的在线更新思路参考[Passive-Aggressive论文](https://jmlr.org/papers/v7/crammer06a.html)，非线性网络与正则化参考[神经网络官方说明](https://scikit-learn.org/stable/modules/neural_networks_supervised.html)。这些资料不提供彩票预测有效性的证据。\n\n` +
    `protocol.json在计算成绩前写入；results.json保存全部模型与逐期结果；predictions.csv保存逐期排除号码及成功/失败；next.json保存实验下一期输出。此前的实验未修改。\n`;
  const csv = ['model,split,year,period,actual,excluded6,success6'];
  for (const r of results) for (const split of ['validation', 'evaluation']) {
    for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual, d.excluded6.join(' '), Number(d.success6)].join(','));
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ model: selected.id, generatedAt: protocol.createdAt,
    role: 'exclude-not-pick', exploratory: true, dataSha256: protocol.dataSha256,
    evidence2026: s, ...selected.next }, null, 2) + '\n');
  console.log(JSON.stringify({ selected: selected.id,
    comparison: results.map((r) => ({ id: r.id, validation: r.validation.successes,
      success2026: r.evaluation.successes, rate: r.evaluation.rate, failures: r.evaluation.failures })),
    next: selected.next.ascending6, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

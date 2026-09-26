import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CONFIGS, EXPERTS, runAdaptive } from './tail-adaptive.mjs';
import { tailStats } from './tail-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, (_, x) => x === Infinity ? 'Infinity' : x, 2) + '\n';
const pct = (p) => `${(100 * p).toFixed(2)}%`;

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-two-adaptive-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(files.length, 0, '拒绝覆盖旧结果');
  const snapshot = await readFile('analysis/special-tail-two-optimized-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['tail-adaptive.mjs', 'run-tail-adaptive.mjs', 'tail-optimize.mjs', 'tail-two.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, configs: CONFIGS, experts: EXPERTS,
    year: 2026, warmup: 30, trainEnd: 146, validationEnd: 206, evaluationEnd: 266, targetRate: 0.95, requiredSuccessesOf60: 57,
    method: 'Experts predict each draw before update. Track their0/1 exclude-two-tail failures after warmup30. Either choose least failures over past30/60 forecasts (ties prefer original gap20 expert), or average expert scores with exp(-eta*failures) weights over past100 forecasts. No current or future loss enters weights.',
    selection: 'Validation147–206 success count, then minimum success count across three20-draw validation blocks, then declared order preferring incumbent. Never choose using207–266. Every draw outputs exactly two tails.',
    caveat: 'Exploratory post-hoc reuse of known2026 data and experts. No independent holdout or claim that a historical95% rate establishes future95%.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runAdaptive(JSON.parse(snapshot)) };
  const previousText = await readFile('analysis/special-tail-two-optimized-2026/results.json', 'utf8'), previous = JSON.parse(previousText);
  report.previousResultsSha256 = hash(previousText);
  assert.equal(previous.protocol.dataSha256, protocol.dataSha256);
  for (const [file, expected] of Object.entries(previous.protocol.hashes)) assert.equal(hash(await readFile(new URL(file, import.meta.url))), expected);
  const old = previous.results.find((r) => r.id === 'gap-prior20');
  for (const split of ['validation', 'evaluation']) assert.deepEqual(report.results[0].details[split].map(({ weights, ...rest }) => rest), old.details[split]);
  const rows = JSON.parse(snapshot), csv = ['model,split,period,actual,actual_tail,excluded_tails,success'];
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    assert.equal(r.details[split].length, 60);
    assert.deepEqual(r[split], tailStats(r.details[split]));
    r.details[split].forEach((d, i) => {
      assert.equal(d.No, (split === 'validation' ? 147 : 207) + i);
      assert.equal(d.actual, rows[d.No - 1].n7);
      assert.equal(d.actualTail, d.actual % 10);
      assert.equal(new Set(d.excludedTails).size, 2);
      assert.ok(d.excludedTails.every((t) => Number.isInteger(t) && t >= 0 && t < 10));
      assert.equal(d.success, !d.excludedTails.includes(d.actualTail));
      assert.ok(d.weights.every((w) => w >= 0));
      assert.ok(Math.abs(d.weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
      csv.push([r.id, split, d.No, d.actual, d.actualTail, d.excludedTails.join(' '), Number(d.success)].join(','));
    });
  }
  const selected = report.results.find((r) => r.id === report.selectedId);
  report.targetMetInHistoricalEvaluation = selected.evaluation.successes >= 57;
  const table = report.results.map((r) => `| ${r.label}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60（${pct(r.evaluation.rate)}） | ${r.evaluation.longestFailure} |`).join('\n');
  const text = `# 杀两个尾数：95%目标检验\n\n只使用2026年第1～266期；每期输出两个不同尾数，两者均不是特别码尾数才算成功。后60期达到95%至少需57次成功。所选模型本次${selected.evaluation.successes}/60，${report.targetMetInHistoricalEvaluation ? '在这段历史上达到目标' : '未达到目标'}。\n\n` +
    `## 本轮改动\n\n固定七个既有规则作为候选专家，用此前30或60期表现动态选一个，或者依据此前100期失败次数调整权重（缓慢0.15、快速0.5）。每次预测只使用此前已揭晓的结果。当前期结果在输出两个尾数之后才能更新规则和表现统计。\n\n` +
    `147～206期用于选择模型：先看成功次数，同分看三个20期分段中的最低成功次数，再同分保留原规则。207～266期不参与选择。配置和目标在运行前写入protocol.json；没有跳过任何期次，没有事后换测试时段。\n\n` +
    `| 方法 | 验证成功 | 后60期成功 | 最长连续失败 |\n|---|---:|---:|---:|\n${table}\n\n` +
    `验证选定${selected.label}，后60期失败${selected.evaluation.failures}次，对应理论成功率基线均值${pct(selected.evaluation.baseline)}。均匀独立开奖下，杀两个尾数的单期成功率取决于是否含0尾，为40/49或39/49；仅换规则不会在该假设下提高到95%。\n\n` +
    `## 证据边界\n\n这批历史已经被反复分析，既有专家也根据旧结果被保留。本轮属于探索性优化；即使某一版本达到57/60，也不足以证明未来能长期达到95%。不能把模型评分或历史成功率直接称为下一期成功概率。\n\n` +
    `截至266期，所选规则针对267期的快照排除尾数为${[...selected.next.excludedTails].sort().join('、')}；不是当前实时结果。\n\n` +
    `## 验证\n\n核对600条逐期预测，原优化模型完全复现，历史模块源码哈希不变。\n\n\`node scripts/special15/run-tail-adaptive.mjs /tmp/tail-adaptive-reproduction\`\n`;
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(json({ selectedId: report.selectedId, targetMet: report.targetMetInHistoricalEvaluation, comparison: report.results.map((r) => ({ id: r.id,
    validation: r.validation.successes, blocks: r.validationBlocks, evaluation: r.evaluation.successes, recent20: r.recent20.successes })), report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CONFIGS, runOptimization } from './tail-optimize.mjs';
import { tailStats } from './tail-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (p) => `${(p * 100).toFixed(2)}%`;
const json = (v) => JSON.stringify(v, (_, value) => value === Infinity ? 'Infinity' : value, 2) + '\n';

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-two-optimized-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(entries.length, 0, '拒绝覆盖已有输出');
  const snapshot = await readFile('analysis/special-tail-two-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['tail-optimize.mjs', 'run-tail-optimize.mjs', 'tail-two.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, configs: CONFIGS,
    trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    selection: 'Maximize validation147–206 successes, then minimum success count over its three chronological20-draw blocks, then declaration order. Keep original consensus as eligible incumbent control. Never reselect by evaluation207–266.',
    design: 'One-factor variants of the existing per-tail gap-condition model: prior20/100 versus50; coarser/finer gap boundaries; exponential decay0.98 versus1. Prior centers retain4/49 for tail0 and5/49 for others. Unknown gaps have their own bin. Predict first, update after outcome. No skipping draws.',
    caveat: 'The gap model was chosen for optimization after inspecting its previous evaluation success53/60. This is explicitly post-hoc exploratory optimization on reused2026 data; the old60-draw evaluation is not an independent holdout.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runOptimization(JSON.parse(snapshot)) };
  const oldText = await readFile('analysis/special-tail-two-2026/results.json', 'utf8'), old = JSON.parse(oldText);
  report.previousResultsSha256 = hash(oldText);
  assert.equal(old.protocol.dataSha256, protocol.dataSha256);
  for (const [file, expected] of Object.entries(old.protocol.hashes)) assert.equal(hash(await readFile(new URL(file, import.meta.url))), expected);
  for (const [newId, oldId] of [['incumbent-consensus', 'consensus'], ['gap-original', 'gap-conditional']]) {
    const a = report.results.find((r) => r.id === newId), b = old.results.find((r) => r.id === oldId);
    assert.deepEqual(a.details, b.details);
    assert.deepEqual(a.next.excludedTails, b.next.excludedTails);
  }
  const rows = JSON.parse(snapshot), csv = ['model,split,period,actual,actual_tail,excluded_tails,success'];
  let audited = 0;
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    assert.deepEqual(r[split], tailStats(r.details[split]));
    assert.equal(r.details[split].length, 60);
    r.details[split].forEach((d, i) => {
      assert.equal(d.No, (split === 'validation' ? 147 : 207) + i);
      assert.equal(d.actual, rows[d.No - 1].n7);
      assert.equal(d.actualTail, d.actual % 10);
      assert.equal(new Set(d.excludedTails).size, 2);
      assert.ok(d.excludedTails.every((v) => Number.isInteger(v) && v >= 0 && v <= 9));
      assert.equal(d.success, !d.excludedTails.includes(d.actualTail));
      csv.push([r.id, split, d.No, d.actual, d.actualTail, d.excludedTails.join(' '), Number(d.success)].join(','));
      audited++;
    });
  }
  const selected = report.results.find((r) => r.id === report.selectedId);
  const comparison = report.results.map((r) => `| ${r.label}${r.id === report.selectedId ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.validationBlocks.join('/')} | ${r.evaluation.successes}/60（${pct(r.evaluation.rate)}） | ${r.evaluation.longestFailure} |`).join('\n');
  const text = `# 排除两个尾数：遗漏条件优化\n\n使用2026年第1～266期历史快照，每期都输出两个不同尾数，特别码两个尾数都未命中才算成功。\n\n` +
    `这次只改变原遗漏条件模型的一项设定：减弱/增强平滑，合并/细分遗漏区间，或让历史权重按每期0.98衰减。其他条件相同；0尾按4/49、其余尾按5/49设置基础概率，未出现过的尾数单独分组。\n\n` +
    `## 固定选择规则\n\n前146期初始化，147～206期验证。优先选验证成功次数多的配置，同分比较连续三个20期分段中最差一段的成功次数，再同分按声明顺序。原综合规则保留为对照候选。后60期（207～266）不用于重新选择。本轮配置在运行前写入protocol.json。\n\n` +
    `| 方法 | 验证成功 | 验证三个20期分段 | 后60期成功 | 最长连续失败 |\n|---|---:|---|---:|---:|\n${comparison}\n\n` +
    `选定 **${selected.label}**，后60期成功${selected.evaluation.successes}次，失败${selected.evaluation.failures}次；最近20期${selected.recent20.successes}/20。对应逐期排除对的理论成功率均值为${pct(selected.evaluation.baseline)}；描述性95% Wilson区间为${selected.evaluation.ci95.map(pct).join('～')}，不校正模型选择和反复试验。\n\n` +
    `## 解读限制\n\n上一轮遗漏模型的53/60已被看到，正是本次围绕它优化的原因。因此本轮属于看过结果后的探索性优化，即使数字提高，也不是独立验证出的提升。仍需把最终规则固定后检验新增开奖。不能将历史成功率视为下一期的保证。\n\n` +
    `失败期：${selected.details.evaluation.filter((d) => !d.success).map((d) => `${d.No}（特别码${d.actual}；排除${d.excludedTails.join('、')}尾）`).join('；')}。\n\n` +
    `截至266期，所选配置针对267期的快照排除结果为${[...selected.next.excludedTails].sort().join('、')}尾；不是实时推荐。\n\n` +
    `## 核对与复现\n\n两个旧模型的逐期结果和下一期尾数完全复现，旧源码哈希不变；核对${audited}条预测。\n\n\`node scripts/special15/run-tail-optimize.mjs /tmp/tail-optimize-reproduction\`\n`;
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(json({ selected: report.selectedId, comparison: report.results.map((r) => ({ id: r.id, label: r.label,
    validation: r.validation.successes, blocks: r.validationBlocks, evaluation: r.evaluation.successes,
    recent20: r.recent20.successes, longestFailure: r.evaluation.longestFailure })), next: selected.next, report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

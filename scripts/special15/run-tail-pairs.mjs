import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CONFIGS, runPairs } from './tail-pairs.mjs';
import { tailStats } from './tail-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, (_, x) => x === Infinity ? 'Infinity' : x, 2) + '\n';
const pct = (p) => `${(100 * p).toFixed(2)}%`;

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-pairs-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(files.length, 0, '拒绝覆盖旧结果');
  const snapshot = await readFile('analysis/special-tail-two-optimized-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['tail-pairs.mjs', 'run-tail-pairs.mjs', 'tail-optimize.mjs', 'tail-two.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, configs: CONFIGS,
    year: 2026, trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    design: 'Enumerate45 unordered pairs. Frequency control equals sum of smoothed100-draw marginal tail frequencies (prior49), so carries no new pair interaction. Shared pair-gap models use time since either tail last occurred: bins0/1+ or0/1–3/4+, plus never observed. Separate zero-containing pairs(base9/49) from nonzero pairs(base10/49). Pool all pairs in each of6/8 groups; one observed draw contributes the average hit fraction of pairs currently in that group, with total weight1 per occupied group. Shrink toward theoretical mass with prior50 group-draw weights. Blend variant averages shared score and frequency50/50. Each forecast ranks45 pair scores and excludes one pair.',
    interpretation: 'Overlapping pairs are correlated; no claim of45 independent samples per draw. Scores are risk rankings, not calibrated probabilities and need not form a coherent45-category distribution. Same-score ties use fixed label-independent hash; incumbent retains original single-tail tie rule.',
    selection: 'Validation147–206 success count, then minimum success count over three20-draw blocks, then declaration order preferring incumbent. Do not reselect using207–266. No skipped draws.',
    caveat: 'Exploratory reuse of known2026 history. Reduced statistical cells are a model-size description, not proof of generalization.95% target means at least57/60 but does not establish a future guarantee.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runPairs(JSON.parse(snapshot)) };
  const oldText = await readFile('analysis/special-tail-two-optimized-2026/results.json', 'utf8'), old = JSON.parse(oldText);
  report.previousResultsSha256 = hash(oldText);
  assert.equal(old.protocol.dataSha256, protocol.dataSha256);
  for (const [file, expected] of Object.entries(old.protocol.hashes)) assert.equal(hash(await readFile(new URL(file, import.meta.url))), expected);
  const incumbent = old.results.find((r) => r.id === 'gap-prior20');
  assert.deepEqual(report.results[0].details, incumbent.details);
  assert.deepEqual(report.results[0].next.excludedTails, incumbent.next.excludedTails);
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
      csv.push([r.id, split, d.No, d.actual, d.actualTail, d.excludedTails.join(' '), Number(d.success)].join(','));
    });
  }
  const selected = report.results.find((r) => r.id === report.selectedId);
  report.targetMet = selected.evaluation.successes >= 57;
  const table = report.results.map((r) => `| ${r.label}${r.id === selected.id ? '（验证选定）' : ''} | ${r.config.cells} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60（${pct(r.evaluation.rate)}） | ${r.evaluation.longestFailure} |`).join('\n');
  const text = `# 降低复杂度，直接评估两尾组合\n\n仅用2026年第1～266期快照；每期选一个两尾组合排除，两尾均不是特别码尾数才算成功。本轮选定${selected.label}，后60期${selected.evaluation.successes}/60，${report.targetMet ? '历史上达到' : '没有达到'}57/60的95%目标。\n\n` +
    `## 组合评估的数学边界\n\n特别码只有一个尾数，因此P(尾数属于{a,b})＝P(尾数=a)＋P(尾数=b)，无需独立性假设。只统计组合出现次数，与相同窗口下相加两个尾数频率等价；它并不增加预测信息。同分时固定打破平局的方式不同，可能选中不同但同分的组合，这也不是新的信息。\n\n` +
    `## 实际做的简化\n\n直接枚举45对，不为45对各建一个复杂模型。根据组合最近一次出现距今多少期，把所有组合共享归入“0期/1期以上”，或“0期/1～3期/4期以上”，另外保留从未出现的状态。含0尾与不含0尾分开，避免把9个号码和10个号码的风险混为一谈。\n\n` +
    `两种共享模型只有6或8个条件统计格，原遗漏模型是10尾×7状态＝70格。组合频率只需10个尾数计数；三分组加频率共8＋10格。每个格记录暴露量和命中量，表格计的是统计格数量，不是严格的自由参数数量。\n\n` +
    `同一期45个组合高度相关，因此每个非空分组只增加一期权重，命中量取该组当期命中比例，不把它当45期独立开奖。组内分数向理论风险收缩；组合评分只用于排序，不声称是校准概率。\n\n` +
    `## 固定规则后的比较\n\n前146期初始化；147～206期选配置，同分看三个20期分段的最差成绩；再同分优先保留原模型。207～266期只用于历史检验，不跳过任何期次。\n\n` +
    `| 方法 | 统计格数量 | 验证成功 | 后60期成功 | 最长连续失败 |\n|---|---:|---:|---:|---:|\n${table}\n\n` +
    `所选模型最近20期成功${selected.recent20.successes}次；后60期对应理论成功率均值${pct(selected.evaluation.baseline)}。该批历史已经反复被检查，本次是探索性结果，不是新的独立测试，也不能据此承诺未来95%。\n\n` +
    `截至266期，所选模型针对267期的快照排除尾数为${[...selected.next.excludedTails].sort().join('、')}；这是旧快照输出，不是实时推荐。results.json保留每种方法对下一期45对组合的完整排序。\n\n` +
    `## 核对与复现\n\n核对600条预测，旧模型逐期结果及下一期结果完全复现，旧模型源码哈希不变。\n\n\`node scripts/special15/run-tail-pairs.mjs /tmp/tail-pairs-reproduction\`\n`;
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(json({ selectedId: report.selectedId, targetMet: report.targetMet, comparison: report.results.map((r) => ({ id: r.id, label: r.label,
    validation: r.validation.successes, blocks: r.validationBlocks, evaluation: r.evaluation.successes, recent20: r.recent20.successes })), report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

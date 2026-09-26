import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CONFIGS, runOrdinary } from './tail-ordinary.mjs';
import { tailStats } from './tail-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const pct = (p) => `${(p * 100).toFixed(2)}%`;
async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-ordinary-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(entries.length, 0, '拒绝覆盖已有实验');
  const snapshot = await readFile('analysis/special-tail-two-optimized-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['tail-ordinary.mjs', 'run-tail-ordinary.mjs', 'tail-optimize.mjs', 'tail-two.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, configs: CONFIGS,
    year: 2026, trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    method: 'Predict next special tail from preceding1/3 draws ordinary n1..n6 tail counts. One-draw count bins0,1,2+; three-draw bins0–1,2–3,4+. Shared models separate tail0 and nonzero tails,6 cells; specific model30 cells. Within a shared group, each draw contributes weight1 and mean candidate hit fraction. Prior20 at4/49 or5/49. Scores normalized for ranking, not claimed calibrated probabilities. Update after outcome; current normal numbers are never features for current forecast.',
    selection: 'Validation success count, then worst20-draw validation block, then declaration order with incumbent first. No skipped draws or evaluation-based selection.',
    caveat: 'Exploratory reuse of2026 data, not an independent test.95% is a target to assess, not a premise or guaranteed result.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runOrdinary(JSON.parse(snapshot)) };
  const previousText = await readFile('analysis/special-tail-two-optimized-2026/results.json', 'utf8'), previous = JSON.parse(previousText);
  report.previousResultsSha256 = hash(previousText);
  assert.equal(previous.protocol.dataSha256, protocol.dataSha256);
  for (const [file, expected] of Object.entries(previous.protocol.hashes)) assert.equal(hash(await readFile(new URL(file, import.meta.url))), expected);
  assert.deepEqual(report.results[0].details, previous.results.find((r) => r.id === 'gap-prior20').details);
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
  const table = report.results.map((r) => `| ${r.label}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60（${pct(r.evaluation.rate)}） |`).join('\n');
  const text = `# 使用往期普通号尾数预测特别码尾数\n\n仅用2026年第1～266期。每期开奖前杀两个不同尾数；两个都不是特别码尾数才算成功。所选模型${selected.label}，后60期${selected.evaluation.successes}/60，${selected.evaluation.successes >= 57 ? '在历史上达到' : '未达到'}95%目标。\n\n` +
    `## 新增的信息\n\n分别统计上一期、近三期前6个普通号的尾数出现次数，再估计下一期各尾成为特别码的条件频率。比较各尾共享分组与逐尾分组，含0尾的基础概率单独处理。没有使用当期普通号推算当期特别码。\n\n` +
    `前146期初始化；147～206期选配置，同分看三个20期分段的最差成绩，再同分保留原模型；207～266期只作历史检验。配置在运行前固定。\n\n| 方法 | 验证成功 | 后60期成功 |\n|---|---:|---:|\n${table}\n\n` +
    `## 95%的边界\n\n如果1～49均匀开奖、各期独立，仅使用往期记录选择两尾，含0尾成功率40/49＝81.63%，不含0尾39/49＝79.59%。历史选期或模型置信度不能改变独立开奖下的真实概率。\n\n` +
    `补充修正此前关于开奖时点的建议：即使同一期前6个普通号已知，在均匀不放回抽取假设下，也不能仅靠这6个号码把杀两尾的成功率推到95%。任意两尾至少涵盖9个号码，最多移除其中6个，剩余43个中仍至少有3个会令排除失败；最有利情况下上限40/43≈93.02%，通常更低。这是规则假设下的数学上限，不是实测成绩，也不表示当前接口提供部分开奖数据。\n\n` +
    `若要支持95%的预测，必须有能在未参与调参的新数据上验证的额外预测信息；现有记录尚未提供这种证据。本轮复用了已经看过的历史，不能视为独立验证。\n\n` +
    `## 复现\n\n核对480条预测并验证原模型结果和源码哈希。\n\n\`node scripts/special15/run-tail-ordinary.mjs /tmp/tail-ordinary-reproduction\`\n`;
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(json({ selectedId: report.selectedId, comparison: report.results.map((r) => ({ label: r.label,
    validation: r.validation.successes, evaluation: r.evaluation.successes })), report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

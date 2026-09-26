import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { COLORS, NUMBERS, CONFIGS, auditMetadata, runColors, colorOf, colorStats } from './color-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const pct = (p) => `${(100 * p).toFixed(2)}%`;
async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-color-two-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(entries.length, 0, '拒绝覆盖已有结果');
  const snapshot = await readFile('analysis/special-tail-two-optimized-2026/snapshot.json', 'utf8');
  const rawText = await readFile(process.argv[3] || '/tmp/fe-special6-optimization-latest.json', 'utf8');
  const raw = JSON.parse(rawText), metadataAudit = auditMetadata(raw);
  assert.deepEqual(normalizeRows(raw, 2026).rows, JSON.parse(snapshot));
  const hashes = {};
  for (const file of ['color-two.mjs', 'run-color-two.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), rawDataSha256: hash(rawText), hashes, configs: CONFIGS,
    colors: Object.fromEntries(COLORS.map((c, i) => [c, NUMBERS[i]])), metadataAudit,
    externalCountReference: 'https://campaigns.hkjc.com/2026-marksix/en/funfacts',
    target: 'Before each draw choose exactly2 of3 colors. Success iff actual n7 color is among them. This is positive coverage, not exclusion of two colors.',
    trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    models: 'Three fixed pairs, smoothed frequency30/100(prior49), previous-special color transition(prior20 toward past100), per-color gap0/1/2–3/4+/unknown(prior20), previous ordinary color count0–1/2/3+(prior20), equal mean of frequency100/gap/transition. Predict then update. Color mapping fixed, verified against every stored annotation.',
    selection: 'Validation successes, then minimum successes in three20-draw blocks, then declaration order. No selection using evaluation207–266. Every draw outputs two colors.',
    caveat: 'New target but reused2026 history; exploratory, not fresh independent validation. Scores are rankings, not guaranteed calibrated probabilities.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  await writeFile(resolve(out, 'raw-with-colors.json'), rawText);
  const report = { protocol, ...runColors(JSON.parse(snapshot)) };
  const rows = JSON.parse(snapshot), csv = ['model,split,period,actual,actual_color,selected_colors,success'];
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    assert.equal(r.details[split].length, 60); assert.deepEqual(r[split], colorStats(r.details[split]));
    r.details[split].forEach((d, i) => {
      assert.equal(d.No, (split === 'validation' ? 147 : 207) + i);
      assert.equal(d.actual, rows[d.No - 1].n7); assert.equal(d.actualColor, colorOf(d.actual));
      assert.equal(new Set(d.selectedColors).size, 2);
      assert.ok(d.selectedColors.every((c) => Number.isInteger(c) && c >= 0 && c < 3));
      assert.equal(d.success, d.selectedColors.includes(d.actualColor));
      csv.push([r.id, split, d.No, d.actual, COLORS[d.actualColor], d.selectedColors.map((c) => COLORS[c]).join(' '), Number(d.success)].join(','));
    });
  }
  const selected = report.results.find((r) => r.id === report.selectedId);
  const table = report.results.map((r) => `| ${r.label}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60（${pct(r.evaluation.rate)}） | ${pct(r.evaluation.baseline)} |`).join('\n');
  const text = `# 预测特别码：三色选两色\n\n每期开奖前选择两种颜色，特别码属于其中任意一种即成功。仍用2026年第1～266期快照；不等同于排除两个尾数，也不是排除两种颜色。\n\n` +
    `## 颜色与基线\n\n项目API的numberInfos记录经核对：266期共1862条颜色记录一致，49个号码全部覆盖，无冲突；红17个、蓝16个、绿16个。这一数量与[香港赛马会颜色说明](https://campaigns.hkjc.com/2026-marksix/en/funfacts)一致，但本实验数据仍来自项目默认history接口，并非替换成香港开奖数据。\n\n` +
    `均匀1～49开奖时，红＋蓝与红＋绿各33/49＝67.35%，蓝＋绿32/49＝65.31%。从三种组合等概率随机选一组，平均命中率2/3≈66.67%。颜色类别少不意味着信息更多或命中率接近95%。\n\n` +
    `## 回测\n\n前146期初始化；147～206期选规则，优先验证成功次数，同分比较三个20期分段的最差成绩，再同分按声明顺序；207～266期只作历史检验。每次先输出两色再学习结果。\n\n| 方法 | 验证命中 | 后60期命中 | 对应理论基线 |\n|---|---:|---:|---:|\n${table}\n\n` +
    `所选${selected.label}后60期成功${selected.evaluation.successes}次、失败${selected.evaluation.failures}次，最长连续失败${selected.evaluation.longestFailure}期。描述性95% Wilson区间${selected.evaluation.ci95.map(pct).join('～')}，不校正反复研究和选择。\n\n` +
    `所有方案使用同一快照和时段；这批历史已经反复用于其他目标，不能视为新独立测试。这里报告的比例不是下一期保证。\n\n` +
    `截至266期，所选模型针对267期的快照输出为${selected.next.names.join('＋')}。这是旧快照的实验结果，不是实时推荐。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-color-two.mjs /tmp/color-two-reproduction analysis/special-color-two-2026/raw-with-colors.json\`\n\n已核对1080条逐期预测。原始颜色信息已随实验保存，复现无需重新访问API。\n`;
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(json({ selected: report.selectedId, comparison: report.results.map((r) => ({ label: r.label,
    validation: r.validation.successes, evaluation: r.evaluation.successes })), report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

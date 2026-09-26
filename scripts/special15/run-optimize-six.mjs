import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { optimizationProtocol, runOptimization } from './optimize-six.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const nums = (v) => v.map((n) => String(n).padStart(2, '0')).join('、');
const names = { original: '原直接排序 C=0.2', 'ema-0.95': '权重平滑0.95',
  'ema-0.99': '权重平滑0.99', 'window-100': '近100期重训', 'temporal-consensus': '原始＋平滑＋近期共同筛选' };

async function main() {
  const input = resolve(process.argv[2] || 'analysis/special6-only-2026/snapshot.json');
  const out = resolve(process.argv[3] || 'analysis/special6-optimization-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (entries.length) throw new Error('输出目录非空，拒绝覆盖已有实验');
  const { rows, audit } = normalizeRows(JSON.parse(await readFile(input, 'utf8')), 2026);
  const priorText = await readFile(resolve('analysis/special6-only-2026/results.json'), 'utf8');
  const prior = JSON.parse(priorText);
  const oldSnapshot = JSON.parse(await readFile(resolve('analysis/special6-only-2026/snapshot.json'), 'utf8'));
  assert.deepEqual(rows.slice(0, 266), oldSnapshot, '既有2026快照发生变更，不能直接比较');
  const snapshot = JSON.stringify(rows, null, 2) + '\n';
  const protocol = optimizationProtocol();
  const hashes = {};
  for (const file of ['optimize-six.mjs', 'run-optimize-six.mjs', 'target-six.mjs', 'model.mjs', 'exclusion.mjs', 'expanded-models.mjs']) {
    hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  }
  const metadata = { generatedAt: new Date().toISOString(), input, audit, hashes,
    dataSha256: hash(snapshot), previousResultsSha256: hash(priorText), newDrawCount: rows.length - 266 };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify({ ...metadata, ...protocol }, null, 2) + '\n');
  const report = { ...metadata, ...runOptimization(rows) };
  const baseline = report.results.find((r) => r.id === 'original');
  const previous = prior.results.find((r) => r.id === 'direct-rank-c0.2');
  assert.deepEqual(baseline.details.validation, previous.details.validation);
  assert.deepEqual(baseline.details.evaluation, previous.details.evaluation);
  const selected = report.results.find((r) => r.id === report.selectedId);
  const s = selected.evaluation;
  const table = report.results.map((r) => `| ${names[r.id]}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.validationBlocks.counts.map((x) => `${x}/20`).join('、')} | ${r.evaluation.successes}/60 (${pct(r.evaluation.rate)}) | ${r.evaluation.meanReplacements.toFixed(2)} |`).join('\n');
  const text = `# 仅2026年：直接排序模型的小范围优化\n\n` +
    `仍然在整期开奖前先筛20个，再取6个排除号码；使用2026年第1～${rows.at(-1).No}期，不引入2025年。新增开奖${metadata.newDrawCount}期。\n\n` +
    `## 结果与决定\n\n本轮选定 **${names[selected.id]}**。第207～266期成功 **${s.successes}/60（${pct(s.rate)}）**，失败${s.failures}期；原算法为${baseline.evaluation.successes}/60（${pct(baseline.evaluation.rate)}）。\n\n` +
    `${selected.id === 'original' ? '**验证区间没有选出优于原算法的配置，保留原算法。** 不因为某个改动在已看过的后60期偶然更高就替换。' : '**仅根据第147～206期验证表现选定此配置。** 后60期只作探索性比较；若其后60期表现退步，也会如实保留。'}\n\n` +
    `随机排除6个全部成功的理论概率是43/49＝87.76%。选定方案后60期的95% Wilson区间为${pct(s.ci95[0])}～${pct(s.ci95[1])}，相对随机基线的单侧二项检验p=${s.pAgainstRandom.toFixed(4)}。这不是下一期已校准的成功概率。\n\n` +
    `## 固定比较\n\n| 配置 | 147～206期成功 | 三段验证各20期成功 | 207～266期成功 | 检验段平均每期更换号码数 |\n|---|---:|---|---:|---:|\n${table}\n\n` +
    `平均更换号码数只描述名单稳定性，不代表预测能力。\n\n` +
    `## 改动\n\n- 权重平滑：对原模型每次更新后的权重作指数平均，分别固定为0.95、0.99，减小单期训练对名单的影响；原始训练更新方法不变。\n- 近期窗口：每20期从最近100个已知训练目标重新训练，预测前完成，不能读取目标期开奖。\n- 共同筛选：先按原模型、平滑0.95、近期窗口的平均风险排名取20个，再按三者中最高的风险排名选6个。\n- 原模型的C、间隔、权重衰减、训练轮数、12维特征不改，不做大量参数搜索。\n\n` +
    `训练第1～146期（前30期仅预热）；验证147～206期。先比较验证成功次数，并列再比较三个20期块的最低成功次数，仍并列优先保留原算法。选择规则和配置在本轮成绩计算前写入protocol.json。\n\n` +
    `原模型在验证和检验两段的120条预测均与上一实验逐条一致，确保优化比较没有悄悄改变基线。\n\n` +
    `## 已看过数据与新开奖\n\n` +
    `147～266期此前已被多轮研究使用，因此本轮仍是探索性优化，不能声称得到全新的独立验证。${metadata.newDrawCount === 0 ? '接口尚无第267期或之后的新开奖，本轮没有前瞻成功率。' : `第267期起另存为forward分段，共${selected.forward.count}期、成功${selected.forward.successes}期，不参与配置选择；这些数据在运行时已获取，不等同于事先存档的实盘预测。`}\n\n` +
    `## 最近表现与下一期\n\n| 检验窗口 | 成功 | 成功率 |\n|---|---:|---:|\n` +
    selected.recent.map((r) => `| 近${r.requested}期 | ${r.successes}/${r.count} | ${pct(r.rate)} |`).join('\n') +
    `\n\n截至2026年第${selected.next.after.No}期，实验预测第${selected.next.target.No}期排除：**${nums(selected.next.ascending6)}**。每期仍固定6个，没有通过减少数量或跳过期数抬高成功率。不能保证100%。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-optimize-six.mjs ${out}/snapshot.json /tmp/special6-optimization-reproduction\`\n\n` +
    `results.json包含全部逐期结果和每次窗口重训范围；predictions.csv用于核对；next.json保存本轮选定方案的下一期候选和生成时间。原实验文件未修改。\n`;
  const csv = ['model,split,year,period,actual,pool20,excluded6,success6'];
  for (const r of report.results) for (const split of ['validation', 'evaluation', 'forward']) {
    for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual,
      d.pool20.join(' '), d.excluded6.join(' '), Number(d.success6)].join(','));
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ generatedAt: metadata.generatedAt, model: selected.id,
    role: 'exclude-not-pick', exploratory: true, dataSha256: metadata.dataSha256,
    selectedUsing: '2026/147–206 only', evidence: selected.evaluation, ...selected.next }, null, 2) + '\n');
  console.log(JSON.stringify({ selected: selected.id, newDraws: metadata.newDrawCount,
    comparison: report.results.map((r) => ({ id: r.id, validation: r.validation.successes,
      validationBlocks: r.validationBlocks.counts, evaluation: r.evaluation.successes,
      meanReplacements: r.evaluation.meanReplacements })),
    next: selected.next.ascending6, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

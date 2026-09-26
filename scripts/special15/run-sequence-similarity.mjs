import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { SEQUENCE_CONFIGS, runSequences } from './sequence-similarity.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const nums = (v) => v.map((n) => String(n).padStart(2, '0')).join('、');

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special6-sequence-vectors-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (entries.length) throw new Error('输出目录非空，拒绝覆盖已有实验');
  const snapshotText = await readFile(resolve('analysis/special6-only-2026/snapshot.json'), 'utf8');
  const rows = JSON.parse(snapshotText);
  assert.equal(rows.length, 266);
  assert.ok(rows.every((r) => r.year === 2026));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshotText),
    moduleSha256: hash(await readFile(new URL('./sequence-similarity.mjs', import.meta.url))),
    runnerSha256: hash(await readFile(new URL('./run-sequence-similarity.mjs', import.meta.url))),
    configs: SEQUENCE_CONFIGS,
    representation: '98 dimensions per chronological draw: unit-norm 49-dimensional ordinary multi-hot block and 49-dimensional special one-hot block, equal group weights, recency decay 0.8. Normal positions are pooled; draw order and special position are preserved.',
    similarity: 'Cosine on 294- or 490-dimensional vectors; score is not next-outcome probability.',
    retrieval: 'All neighbour windows AND their next-draw labels must be strictly before the query window. Greedy non-overlap among historical window-plus-outcome spans. Fewer than K neighbours are allowed and reported if necessary.',
    prediction: 'Similarity weights exp(8*cosine), normalized to actual neighbour count. Mix next-special votes with a 20-sample prior from smoothed past-100 frequencies; exclude bottom 20 then bottom 6.',
    validation: '2026/147–206', evaluation: '2026/207–266',
    selection: 'Choose among the four sequence variants by validation exclude-6 successes only, ties follow configuration order. Existing frequency/KNN results are comparison controls, not refitted here.',
    caveat: 'Exploratory re-use of previously examined data. Similar histories are not proof that future draws share an outcome distribution.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'snapshot.json'), snapshotText);
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  const report = { protocol, ...runSequences(rows) };
  const oldText = await readFile(resolve('analysis/special6-only-2026/results.json'), 'utf8');
  const previous = JSON.parse(oldText);
  assert.equal(previous.dataSha256, protocol.dataSha256);
  report.controlResultsSha256 = hash(oldText);
  report.controls = ['frequency-100', 'knn-30'].map((id) => {
    const r = previous.results.find((m) => m.id === id);
    return { id, validation: r.validation, evaluation: r.evaluation };
  });
  const selected = report.results.find((r) => r.id === report.selectedId), s = selected.evaluation;
  const query = rows.slice(-selected.config.length);
  const neighbours = selected.next.neighbours;
  const comparison = [...report.controls, ...report.results].map((r) =>
    `| ${r.id}${r.id === selected.id ? '（序列法中验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60 (${pct(r.evaluation.rate)}) | ${r.evaluation.failures} |`).join('\n');
  const text = `# 用序列向量查找相似历史\n\n` +
    `向量能找相似片段；本实验进一步检验相似片段的“下一期特别码”是否有助于排除6个号码。只使用2026年第1～266期。\n\n` +
    `## 与之前KNN的区别\n\n之前用近30期特别码和普通号频率组成98维统计向量；这次每期分别编码前6个号码的集合和第7位，再按时间拼接连续3期或5期，形成294维或490维向量。前6个号码内部不区分位置，但每一期的先后顺序和特别码角色保留。\n\n` +
    `使用余弦相似度，近期权重更高。没有把数字12和13天然当成比12和40更相似；号码按类别编码。相似度100%表示这种编码一致，不表示下一期100%相同。\n\n` +
    `## 当前查询片段\n\n序列法验证选定配置：${selected.id}。查询为2026年第${selected.next.queryFrom}～${selected.next.queryTo}期，用于预测第267期。\n\n| 期号 | 前6个号码 | 特别码 |\n|---|---|---:|\n` +
    query.map((r) => `| ${r.No} | ${nums(Array.from({ length: 6 }, (_, i) => r['n' + (i + 1)]))} | ${String(r.n7).padStart(2, '0')} |`).join('\n') +
    `\n\n## 找到的相似历史及其后继结果\n\n| 历史片段 | 余弦相似度 | 片段内特别码序列 | 下一期 | 下一期特别码 |\n|---|---:|---|---:|---:|\n` +
    neighbours.map((n) => `| ${n.from}～${n.to}期 | ${pct(n.similarity)} | ${nums(n.specialSequence)} | ${n.nextPeriod} | ${String(n.nextSpecial).padStart(2, '0')} |`).join('\n') +
    `\n\n实际取${selected.next.actualNeighborCount}个互不重叠的历史案例，后继特别码有${selected.next.distinctFollowingSpecials}种。相似片段后继号码分散时，不能只凭某条“看着像”的历史下结论；没在这些少量案例出现的号码也不是不可能出现。\n\n` +
    `为减少重复证据，历史片段连同下一期结果均不能与查询片段重叠，历史案例之间也不能重叠。邻居数量不足设定K时按实际数量计算，逐期记录实际数量。投票按相似度加权，并向过去100期的平滑频率收缩，避免未观察号码被赋予零概率。最终排序分数仍不宣称为校准概率。\n\n` +
    `## 排除6个的回测\n\n每期仅检索此前已揭晓的历史。147～206期选择序列配置，207～266期作历史检验；配置预先写入protocol.json，未根据后60期更换。\n\n| 方法 | 验证成功 | 后60期成功 | 后60期失败 |\n|---|---:|---:|---:|\n${comparison}\n\n` +
    `序列法选定模型成功${s.successes}/60（${pct(s.rate)}），95% Wilson区间${pct(s.ci95[0])}～${pct(s.ci95[1])}；随机排除6个的理论基线为43/49＝87.76%，单侧二项检验p=${s.pAgainstRandom.toFixed(4)}。检验只是探索性描述，这批数据已用于多个实验，不是新测试集。\n\n` +
    `这说明需要区分“确实找到了相似历史”和“相似度对后继号码有预测价值”。本轮结果不会自动替换此前模型，也不能承诺100%。\n\n` +
    `## 下一期序列法实验输出\n\n截至第266期，序列法排除6码：**${nums(selected.next.ascending6)}**。仅作为该方法的实验结果，不是保证不会出现的号码。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-sequence-similarity.mjs /tmp/sequence-vectors-reproduction\`\n\nresults.json保存所有配置的逐期结果和下一期相似案例；neighbours.json单独保存当前查询与检索结果；predictions.csv保存逐期排除记录。\n`;
  const csv = ['model,split,year,period,actual,excluded6,success6,actual_neighbors,nearest_cosine'];
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual,
      d.excluded6.join(' '), Number(d.success6), d.actualNeighborCount, d.nearestSimilarity].join(','));
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'neighbours.json'), JSON.stringify({ model: selected.id, query,
    dimension: selected.config.length * 98, neighbours, next: selected.next }, null, 2) + '\n');
  console.log(JSON.stringify({ selected: selected.id, query: [selected.next.queryFrom, selected.next.queryTo],
    comparison: [...report.controls, ...report.results].map((r) => ({ id: r.id,
      validation: r.validation.successes, evaluation: r.evaluation.successes })),
    closest: neighbours.slice(0, 5), next: selected.next.ascending6,
    report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

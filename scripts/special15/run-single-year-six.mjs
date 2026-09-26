import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { singleYearProtocol, runSingleYearSix } from './single-year-six.mjs';
import { normalizeRows } from './model.mjs';
import { sixStats } from './target-six.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const nums = (v) => v.map((n) => String(n).padStart(2, '0')).join('、');
const names = { 'frequency-30': '近30期频率', 'frequency-100': '近100期频率',
  'logistic-l2-0.01': '逻辑回归 L2=0.01', 'logistic-l2-0.1': '逻辑回归 L2=0.1',
  'knn-15': 'KNN 15邻居', 'knn-30': 'KNN 30邻居',
  'markov-shrink-50': '平滑转移', 'gap-hazard-100': '遗漏间隔',
  'boosted-stumps-32': '浅层提升树', 'consensus-two-stage': '六模型共同筛选',
  'direct-rank-c0.05': '直接排序 C=0.05', 'direct-rank-c0.2': '直接排序 C=0.2',
  'listwise-mlp-8': '8单元神经网络', 'listwise-mlp-16': '16单元神经网络',
  'previous-normal-six': '上一期前6个', 'previous-last-six': '上一期后6个' };

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special6-only-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (files.length) throw new Error('输出目录非空，拒绝覆盖已有实验');
  const source = JSON.parse(await readFile(resolve('analysis/special15-2026/snapshot.json'), 'utf8'));
  const { rows, audit } = normalizeRows(source, 2026);
  const snapshot = JSON.stringify(rows, null, 2) + '\n';
  const p = singleYearProtocol(rows);
  const hashes = {};
  for (const file of ['single-year-six.mjs', 'run-single-year-six.mjs', 'model.mjs', 'exclusion.mjs',
    'expanded-models.mjs', 'target-six.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const metadata = { generatedAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, audit,
    modelData: 'Only normalized 2026 draws. Prior-year comparison files are not passed to model training or selection.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify({ ...metadata, ...p }, null, 2) + '\n');
  const experiment = runSingleYearSix(rows);
  // Read previous experiments ONLY AFTER the new predictions and selection are finished.
  const comparisonFiles = [
    'analysis/special6-expanded-2025-2026/results.json',
    'analysis/special6-target-models-2025-2026/results.json',
  ];
  const priorResults = [], comparisonHashes = {};
  for (const file of comparisonFiles) {
    const content = await readFile(resolve(file), 'utf8');
    comparisonHashes[file] = hash(content);
    priorResults.push(...JSON.parse(content).results);
  }
  const matched = experiment.results.map((r) => {
    const old = priorResults.find((x) => x.id === r.id);
    assert.ok(old, `缺少 ${r.id} 的往年对照`);
    const details = old.details.evaluation.filter((d) => d.year === 2026 && d.No >= p.evaluation.from && d.No <= p.evaluation.to);
    assert.equal(details.length, r.details.evaluation.length);
    details.forEach((d, i) => {
      assert.equal(d.No, r.details.evaluation[i].No);
      assert.equal(d.actual, r.details.evaluation[i].actual);
    });
    return { id: r.id, with2025: sixStats(details), only2026: r.evaluation };
  });
  const report = { ...metadata, ...experiment, matchedComparison: matched, comparisonHashes };
  const selected = report.results.find((r) => r.id === report.selectedId), s = selected.evaluation;
  const oldSelected = matched.find((r) => r.id === selected.id).with2025;
  const table = report.results.map((r, i) => `| ${names[r.id]}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60 (${pct(r.evaluation.rate)}) | ${matched[i].with2025.successes}/60 (${pct(matched[i].with2025.rate)}) | ${r.evaluation.failures} |`).join('\n');
  const text = `# 仅使用2026年：排除6个的完整比较\n\n` +
    `只使用2026年第${rows[0].No}～${rows.at(-1).No}期，共${rows.length}期；2025年数据不进入预热、特征、初始化、训练和逐期更新。16个配置的评分方法和超参数均沿用此前固定版本，不重新搜索参数。\n\n` +
    `## 结果\n\n根据2026年第${p.validation.from}～${p.validation.to}期选择 **${names[selected.id]}（${selected.id}）**。第${p.evaluation.from}～${p.evaluation.to}期中，6个全部排除成功 **${s.successes}/${s.count}（${pct(s.rate)}）**，失败 **${s.failures}期**。随机排除6个的理论基线是43/49＝**87.76%**。\n\n` +
    `95% Wilson区间${pct(s.ci95[0])}～${pct(s.ci95[1])}；相对随机基线的单侧二项检验p=${s.pAgainstRandom.toFixed(4)}。${s.pAgainstRandom < 0.05 ? '本段历史高于基线，但数据已被反复使用，不能据此确认前瞻优势，更不能保证100%。' : '这段样本没有足够证据证明稳定超过随机基线。'}\n\n` +
    `## 时间划分\n\n- 训练：第${p.training.from}～${p.training.to}期；前30期仅用作特征预热，监督模型有${p.training.labelCount}个训练目标。\n- 验证：第${p.validation.from}～${p.validation.to}期，60期，仅用于选配置，并列按原声明顺序。\n- 检验：第${p.evaluation.from}～${p.evaluation.to}期，60期，先预测再学习已揭晓结果。\n- 每期固定先筛20个再取6个；不跳过失败期。六模型共同筛选保留原来的两阶段不同评分标准。\n- 历史数据已被前面的实验查看，属于探索性复用，不是新的独立测试。\n\n` +
    `## 相同期号对照\n\n两列均只计算2026年第${p.evaluation.from}～${p.evaluation.to}期，避免把60期与266期直接比较。带入2025列使用此前保存的逐期预测，在新模型训练与选择完成后才读取，仅用于报告。训练起点、初始化和更新历程随历史范围不同而变化，因此这是两种使用历史方式的整体比较。\n\n` +
    `| 方法 | 仅2026：验证成功 | 仅2026：检验成功 | 带入2025：同60期成功 | 仅2026失败 |\n|---|---:|---:|---:|---:|\n${table}\n\n` +
    `同一选定配置在本60期：仅2026为${pct(s.rate)}，带入2025历史为${pct(oldSelected.rate)}。其他配置的检验成绩只作诊断，不能因事后成绩更高而替换验证选定模型。\n\n` +
    `## 选定模型近期表现\n\n| 请求窗口 | 实际期数 | 成功次数 | 成功率 |\n|---|---:|---:|---:|\n` +
    selected.recent.map((r) => `| 近${r.requested}期 | ${r.count}${r.count < r.requested ? '（不足请求窗口）' : ''} | ${r.successes} | ${pct(r.rate)} |`).join('\n') +
    `\n\n## 下一期实验排除6码\n\n截至2026年第${rows.at(-1).No}期，此后下一期的实验结果：**${nums(selected.next.ascending6)}**。这是排除号码，不是正向候选，也不保证全部避开特别码。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-single-year-six.mjs /tmp/special6-only-2026-reproduction\`\n\n` +
    `snapshot.json仅含2026年；protocol.json在成绩计算前保存；results.json和predictions.csv包含全部逐期结果；next.json记录验证选定模型的下一期输出；相同期号对照也保存在results.json中。\n`;
  const csv = ['model,split,year,period,actual,pool20,excluded6,success6'];
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual,
      d.pool20.join(' '), d.excluded6.join(' '), Number(d.success6)].join(','));
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ model: selected.id, role: 'exclude-not-pick',
    generatedAt: metadata.generatedAt, dataSha256: metadata.dataSha256, year: 2026,
    exploratory: true, evidence: s, ...selected.next }, null, 2) + '\n');
  console.log(JSON.stringify({ selected: selected.id, comparison: report.results.map((r, i) => ({
    id: r.id, validation: r.validation.successes, only2026: r.evaluation.successes,
    count: r.evaluation.count, with2025SamePeriods: matched[i].with2025.successes })),
    selectedMetrics: s, next: selected.next.ascending6, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

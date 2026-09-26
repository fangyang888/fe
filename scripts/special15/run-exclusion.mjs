import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { replayExclusions } from './exclusion.mjs';

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const nums = (arr) => arr.map((n) => String(n).padStart(2, '0')).join('、');
const hash = (content) => createHash('sha256').update(content).digest('hex');
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const input = resolve(process.argv[2] || 'analysis/special15-2026');
  const out = resolve(process.argv[3] || 'analysis/special10-exclusion-2026');
  let existing = [];
  try { existing = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing.length) throw new Error('输出目录非空，拒绝覆盖已有实验');
  const snapshot = await readFile(resolve(input, 'snapshot.json'));
  const rows = JSON.parse(snapshot);
  const previous = JSON.parse(await readFile(resolve(input, 'results.json'), 'utf8'));
  assert.equal(hash(snapshot), previous.dataSha256, '原始数据哈希不匹配');
  assert.equal(hash(await readFile(resolve(here, 'model.mjs'))), previous.modelSha256, '原始模型已改变');
  const protocol = {
    createdAt: new Date().toISOString(), year: 2026, dataSha256: previous.dataSha256,
    modelSha256: previous.modelSha256,
    exclusionSha256: hash(await readFile(resolve(here, 'exclusion.mjs'))),
    runnerSha256: hash(await readFile(resolve(here, 'run-exclusion.mjs'))),
    dataThrough: rows.at(-1).No, sourceExperiment: input,
    evaluation: 'Exploratory reuse of already inspected 2026 data; not a fresh holdout or prospective test.',
    selection: 'Lowest-scoring 20, then lowest-scoring 10 within those 20. Same score for both stages: exactly equivalent to bottom-10 directly.',
    successDefinition: 'All 10 excluded numbers miss the single n7 special number; do not average per-number success.',
    baselines: { exclude20: 29 / 49, exclude10: 39 / 49, individualNumber: 48 / 49 },
    configSelection: 'Highest validation exclude-10 group success count, ties follow original config declaration order. No test-based selection.',
    originalSplits: previous.protocol, originalSelectedId: previous.selectedId,
  };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  const result = { protocol, ...replayExclusions(rows, previous) };
  const selected = result.results.find((r) => r.id === result.selectedId);
  const s = selected.test.final10;
  const csv = ['model,split,year,period,actual,pool20,excluded10,success20,success10'];
  for (const r of result.results) {
    for (const split of ['validation', 'test']) {
      for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual,
        d.pool20.join(' '), d.excluded10.join(' '), Number(d.success20), Number(d.success10)].join(','));
    }
  }
  const report = `# 2026 年特别码：先排除 20 个，再取 10 个\n\n` +
    `最终输出是 **10 个不会中特别码的排除号码**。沿用 2026 年第 1～266 期快照：前 146 期训练，第 147～206 期选择配置，第 207～266 期作历史比较。\n\n` +
    `这是看过首轮结果后提出的新思路，使用的是已查看过的历史数据，所有结果属于探索性分析，不能称作新的独立测试。原始模型和参数未调整，720 条原 Top-15 预测均逐条验证复现一致。\n\n` +
    `## 理论概率\n\n` +
    `公平、独立、1～49 均匀开奖时：随机排除 20 个全部成功 = 29/49 = **${pct(29 / 49)}**；随机排除 10 个全部成功 = 39/49 = **${pct(39 / 49)}**；单个号码不中特别码 = 48/49 = **${pct(48 / 49)}**。本报告统计的是一整组全部排除成功，不采用容易显得很高的逐号码平均成功率。\n\n` +
    `同一评分先取最低 20 个，再取其中最低 10 个，等价于直接取全体最低 10 个。两阶段不是独立事件，不能把两个成功率相乘；20 个全部成功时，其任意 10 个子集也必然成功。缩小集合本身就会提高排除成功率，不能据此认定模型改善。\n\n` +
    `## 历史比较\n\n| 配置 | 验证：排除10个成功 | 第207～266期：排除20个成功 | 第207～266期：排除10个成功 |\n|---|---:|---:|---:|\n` +
    result.results.map((r) => `| ${r.id}${r.id === result.selectedId ? '（验证选定）' : ''} | ${r.validation.final10.successes}/60 (${pct(r.validation.final10.rate)}) | ${r.test.stage20.successes}/60 (${pct(r.test.stage20.rate)}) | ${r.test.final10.successes}/60 (${pct(r.test.final10.rate)}) |`).join('\n') +
    `\n\n按验证区间选定 **${result.selectedId}**，之后 60 期排除 10 个成功 **${s.successes}/60（${pct(s.rate)}）**；随机理论基线 **${pct(s.baseline)}**，差值 **${(s.excess * 100).toFixed(2)} 个百分点**。95% Wilson 区间为 ${pct(s.ci95[0])}～${pct(s.ci95[1])}。\n\n` +
    `单侧二项检验 p=${s.pAgainstRandom.toFixed(4)}，仅作探索性描述（未针对多次尝试修正）。${s.pAgainstRandom < 0.05 ? '本次历史样本高于随机基线，但需要新开奖独立验证。' : '未发现足够证据证明优于随机排除 10 个。'}最长连续排除失败 ${s.longestFailure} 期。\n\n` +
    `选定模型中，20 个池包含特别码、但缩成 10 个后避开特别码的情况有 ${selected.test.rescuedByReduction} 期。保留 10 个的成功率升高包含这种集合缩小效应。\n\n` +
    `## 下一期实验排除号码\n\n截至 2026 年第 ${rows.at(-1).No} 期，预测此后下一期。\n\n` +
    `第一阶段 20 个：${nums([...selected.next.pool20].sort((a, b) => a - b))}\n\n` +
    `**最终排除 10 个：${nums(selected.next.ascending10)}**\n\n` +
    `这 10 个是排除号码，不是正向候选号码。历史成功率不是下一期已经校准的概率。结果仅为实验输出，使用前须核实开奖数据是否已更新。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-exclusion.mjs analysis/special15-2026 /tmp/special10-exclusion-reproduction\`\n\n` +
    `results.json 保存所有模型和逐期明细；predictions.csv 为逐期核对表；next.json 为最终选定模型的排除结果；protocol.json 保存规则、哈希和探索性分析说明。原始 Top-15 实验文件没有修改。\n`;
  await writeFile(resolve(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ model: result.selectedId,
    generatedAt: protocol.createdAt, dataSha256: protocol.dataSha256, role: 'exclude-not-pick',
    evidence: selected.test, exploratory: true, ...selected.next }, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), report);
  console.log(JSON.stringify({ selected: result.selectedId,
    comparison: result.results.map((r) => ({ model: r.id,
      validation10: r.validation.final10.successes, test20: r.test.stage20.successes,
      test10: r.test.final10.successes })),
    selectedTest: s, finalExclude10: selected.next.ascending10,
    report: resolve(out, 'report.md') }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

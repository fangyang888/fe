import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { BEHAVIOR_CONFIGS, runBehaviors } from './behavior-graph.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(100 * v).toFixed(2)}%`;
async function main() {
  const out = resolve(process.argv[2] || 'analysis/special6-behavior-graph-2026');
  let entries = [];
  try { entries = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(entries.length, 0, '拒绝覆盖已有输出');
  const snapshot = await readFile('analysis/special6-only-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['behavior-graph.mjs', 'run-behavior-graph.mjs', 'model.mjs', 'exclusion.mjs', 'target-six.mjs']) {
    hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  }
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes,
    year: 2026, trainEnd: 146, validationEnd: 206, evaluationEnd: 266, configs: BEHAVIOR_CONFIGS,
    trajectory: 'For each number, encode preceding L draws as ordinary/special bit masks. Pool state outcomes across number identities. Exact matches for L5; weighted Hamming radius1 for L10, normal mismatch cost1, special cost2, distance1 weight0.5. Smooth with 100 candidate exposures at baseline1/49. Update only after prediction. Candidate exposures within a draw are correlated, not independent evaluation trials. Scores are not calibrated probabilities.',
    graph: 'Previous ordinary numbers and previous special number each condition next n7 through separate 49x49 tables. Shrink conditional rows by prior20 to add-one-smoothed historical special frequencies. Blend ordinary mean75% and special25%. Optional decay0.98 applied at each observed draw.',
    selection: 'Frozen incumbent ema-0.95 first, then four declared variants. Maximize validation147–206 exclude6 successes, ties prefer incumbent then declaration order. Never select using evaluation207–266.',
    caveat: 'Repeated exploratory use of known 2026 results, not a new independent holdout. Each evaluation trial is a draw; success requires all six exclusions to avoid n7.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runBehaviors(JSON.parse(snapshot)) };
  const oldText = await readFile('analysis/special6-optimization-2026/results.json', 'utf8');
  const old = JSON.parse(oldText);
  assert.equal(old.dataSha256, protocol.dataSha256);
  report.controlResultsSha256 = hash(oldText);
  const incumbent = old.results.find((r) => r.id === 'ema-0.95');
  assert.ok(incumbent);
  report.results.unshift(incumbent);
  report.selectedId = [...report.results].sort((a, b) => b.validation.successes - a.validation.successes)[0].id;
  const selected = report.results.find((r) => r.id === report.selectedId);
  const csv = ['model,split,year,period,actual,excluded6,success6'];
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    assert.equal(r.details[split].length, 60);
    for (const d of r.details[split]) {
      assert.equal(new Set(d.excluded6).size, 6);
      assert.ok(d.excluded6.every((n) => n >= 1 && n <= 49 && d.pool20.includes(n)));
      assert.equal(d.success6, !d.excluded6.includes(d.actual));
      csv.push([r.id, split, d.year, d.No, d.actual, d.excluded6.join(' '), Number(d.success6)].join(','));
    }
  }
  const comparison = report.results.map((r) => `| ${r.id}${r.id === selected.id ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60 | ${pct(r.evaluation.rate)} |`).join('\n');
  const text = `# 号码自身轨迹与跨期关联实验\n\n仅2026年第1～266期；目标为开奖前排除6个号码，6个全部不含当期特别码才算成功。\n\n` +
    `## 两类新方法\n\n1. 号码自身轨迹：把每个号码近5期或10期的普通号出现、特别码出现分别编码，跨号码查找相同或接近的轨迹，统计下一期成为特别码的频率。相似的是出现过程，号码数值大小不代表距离。状态统计做收缩，没出现过的结果不会被当作零风险。同一期49个候选状态存在相关性，不能算作49个独立开奖样本。\n2. 跨期关联：统计上一期每个普通号、特别码与下一期特别码的关系，分别测试全历史计数和近期衰减计数。关联表很稀疏，向历史频率收缩；这是检验历史关联的实验，不代表存在因果关系。\n\n` +
    `## 相同时间段对照\n\n前146期初始化；147～206期用于选择配置；207～266期做逐期历史检验，每次先预测再更新。参数在运行前写入protocol.json。当前EMA方案作为冻结对照，同分优先保留。\n\n| 方法 | 验证成功 | 后60期成功 | 后60期成功率 |\n|---|---:|---:|---:|\n${comparison}\n\n` +
    `按验证段选定 **${selected.id}**；后60期成功${selected.evaluation.successes}次、失败${selected.evaluation.failures}次。随机固定排除6个，在均匀独立开奖假设下成功率43/49＝87.76%。这批历史已反复用于试验，结果属于探索性回测，不能视为新独立测试，也不能推导未来100%。\n\n` +
    `截至266期的所选模型下一期实验排除码：${selected.next.ascending6.map((n) => String(n).padStart(2, '0')).join('、')}。具体分数只用于排序，并非校准概率。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-behavior-graph.mjs /tmp/behavior-graph-reproduction\`\n\nresults.json保存全部逐期预测；predictions.csv便于核对；snapshot.json及protocol.json固定数据、参数与源码哈希。\n`;
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(JSON.stringify({ selectedId: selected.id, comparison: report.results.map((r) => ({ id: r.id,
    validation: r.validation.successes, evaluation: r.evaluation.successes })), report: resolve(out, 'report.md') }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

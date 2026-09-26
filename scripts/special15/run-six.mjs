// Re-evaluate the already-saved, pre-outcome rankings; no retraining or score changes.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { metrics } from './model.mjs';

const sourceDirectory = resolve('analysis/special10-expanded-2025-2026');
const out = resolve(process.argv[2] || 'analysis/special6-expanded-2025-2026');
const baseline = 43 / 49;
const pct = (p) => `${(p * 100).toFixed(2)}%`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const nums = (values) => values.map((n) => String(n).padStart(2, '0')).join('、');

function reduceRows(rows) {
  return rows.map((r) => {
    assert.equal(new Set(r.pool20).size, 20);
    assert.equal(new Set(r.excluded10).size, 10);
    assert.ok(r.excluded10.every((n) => r.pool20.includes(n)));
    const excluded6 = r.excluded10.slice(0, 6); // Order is score order, never ascending number order.
    assert.equal(new Set(excluded6).size, 6);
    const success6 = !excluded6.includes(r.actual);
    assert.ok(!r.success10 || success6);
    return { year: r.year, No: r.No, actual: r.actual, pool20: r.pool20,
      excluded10: r.excluded10, excluded6, success6, success10: r.success10 };
  });
}

function sixMetrics(rows) {
  const { hits: successes, longestMiss: longestFailure, pAgainstRandom: _oldNull, ...stats } =
    metrics(rows.map((r) => ({ hit: r.success6 })));
  let logChoose = 0, pAgainstRandom = 0;
  for (let k = 0; k <= stats.count; k++) {
    if (k >= successes) pAgainstRandom += Math.exp(logChoose + k * Math.log(baseline) +
      (stats.count - k) * Math.log1p(-baseline));
    if (k < stats.count) logChoose += Math.log(stats.count - k) - Math.log(k + 1);
  }
  return { ...stats, successes, failures: stats.count - successes, longestFailure, baseline,
    excess: stats.rate - baseline, pAgainstRandom: Math.min(1, pAgainstRandom) };
}

async function main() {
  let existing = [];
  try { existing = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing.length) throw new Error('输出目录非空，拒绝覆盖已有实验');
  const sourceText = await readFile(resolve(sourceDirectory, 'results.json'), 'utf8');
  const source = JSON.parse(sourceText);
  assert.equal(hash(await readFile(resolve(sourceDirectory, 'snapshot.json'))), source.dataSha256);
  const protocol = { createdAt: new Date().toISOString(), sourceDirectory,
    sourceResultsSha256: hash(sourceText), dataSha256: source.dataSha256,
    runnerSha256: hash(await readFile(new URL('./run-six.mjs', import.meta.url))),
    size: 6, baseline, originalSelectedId: source.selectedId,
    originalProtocol: source.protocol,
    selection: 'Keep all original scores; take first six of the score-ordered final ten inside the original twenty. Select configuration by 2025 validation six-exclusion successes, ties follow original order.',
    caveat: 'Post-hoc size change on already examined data; exploratory only. All six must miss n7 to count as a successful draw.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  const candidates = source.results.map((r) => ({ source: r,
    validation: sixMetrics(reduceRows(r.details.validation)) }));
  const selectedId = [...candidates].sort((a, b) => b.validation.successes - a.validation.successes)[0].source.id;
  const results = candidates.map(({ source: r, validation }) => {
    const details = { validation: reduceRows(r.details.validation), evaluation: reduceRows(r.details.evaluation) };
    const excluded6 = r.next.excluded10.slice(0, 6);
    return { id: r.id, family: r.family, validation, evaluation: sixMetrics(details.evaluation),
      previous10: r.evaluation.final10, rescuedByReduction: details.evaluation.filter((d) => !d.success10 && d.success6).length,
      recent: [20, 50, 100].map((requested) => ({ requested, ...sixMetrics(details.evaluation.slice(-requested)) })),
      next: { after: r.next.after, pool20: r.next.pool20, excluded6, ascending6: [...excluded6].sort((a, b) => a - b) },
      details };
  });
  const report = { protocol, selectedId, results };
  const selected = results.find((r) => r.id === selectedId), s = selected.evaluation;
  const original = results.find((r) => r.id === source.selectedId);
  const csv = ['model,split,year,period,actual,excluded6,success6,success10'];
  for (const r of results) for (const split of ['validation', 'evaluation']) {
    for (const d of r.details[split]) csv.push([r.id, split, d.year, d.No, d.actual,
      d.excluded6.join(' '), Number(d.success6), Number(d.success10)].join(','));
  }
  const text = `# 2025＋2026：最终排除数量由10个改为6个\n\n` +
    `沿用631期快照、同一批原始逐期评分和参数。每期先筛20个，再按原来的第二阶段排序取前6个，不是按号码大小取6个。不重新训练或优化评分，不跳过任何开奖。\n\n` +
    `## 理论基线\n\n公平独立开奖下，10个全部排除成功的理论概率为39/49＝79.59%；6个全部排除成功为43/49＝**${pct(baseline)}**。仅缩小集合就提高8.16个百分点，不代表预测能力提升。\n\n` +
    `## 2026年第1～266期结果\n\n| 模型 | 2025验证：排除6个成功 | 2026排除10个成功 | 2026排除6个成功 | 排除6个失败期数 |\n|---|---:|---:|---:|---:|\n` +
    results.map((r) => `| ${r.id}${r.id === selectedId ? '（按6个目标验证选定）' : ''} | ${r.validation.successes}/${r.validation.count} (${pct(r.validation.rate)}) | ${r.previous10.successes}/${r.previous10.count} (${pct(r.previous10.rate)}) | ${r.evaluation.successes}/${r.evaluation.count} (${pct(r.evaluation.rate)}) | ${r.evaluation.failures} |`).join('\n') +
    `\n\n原先选定的 **${original.id}**，保持模型不变，只减少数量：从10个的${pct(original.previous10.rate)}，变为6个的 **${original.evaluation.successes}/${original.evaluation.count}（${pct(original.evaluation.rate)}）**。\n\n` +
    `针对排除6个重新按2025验证段选择的配置是 **${selectedId}**。2026年成功 **${s.successes}/${s.count}（${pct(s.rate)}）**，失败 **${s.failures}期**；比随机基线高 ${(s.excess * 100).toFixed(2)} 个百分点。95% Wilson区间 ${pct(s.ci95[0])}～${pct(s.ci95[1])}，最长连续失败 ${s.longestFailure} 期。\n\n` +
    `单侧二项检验p=${s.pAgainstRandom.toFixed(4)}，仅作探索性描述。${s.pAgainstRandom < 0.05 ? '本段成绩高于基线，但没有新的独立检验支持，不能承诺100%。' : '没有足够证据证明优于随机排除6个，更不能保证100%。'}\n\n` +
    `这批2026年数据已用于多次比较，改变排除数量也是看过结果后提出的新方案，不能把本次成绩称作新的独立测试。2026成绩最高的配置不会替换2025验证段选定的配置。\n\n` +
    `## 选定模型最近表现\n\n| 窗口 | 成功 | 成功率 |\n|---|---:|---:|\n` +
    selected.recent.map((m) => `| 近${m.requested}期（实际${m.count}期） | ${m.successes}/${m.count} | ${pct(m.rate)} |`).join('\n') +
    `\n\n## 下一期实验排除6码\n\n截至2026年第${selected.next.after.No}期，预测此后下一期：\n\n**${nums(selected.next.ascending6)}**\n\n` +
    `这是排除号码，不是正向候选号码；历史成功率不等于下一期已校准的概率。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-six.mjs /tmp/special6-reproduction\`\n\n保留原始扩展实验目录后可复现。results.json包含全部逐期记录，predictions.csv方便核对，protocol.json记录原数据和结果哈希。\n`;
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ generatedAt: protocol.createdAt,
    model: selectedId, role: 'exclude-not-pick', exploratory: true, dataSha256: protocol.dataSha256,
    evidence2026: s, ...selected.next }, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  console.log(JSON.stringify({ selectedId,
    comparison: results.map((r) => ({ id: r.id, validation: r.validation.successes,
      success2026: r.evaluation.successes, rate: r.evaluation.rate, failures: r.evaluation.failures })),
    selected: s, next: selected.next.ascending6, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

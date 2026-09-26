import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CONFIGS, runTails, tailStats } from './tail-two.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const pct = (v) => `${(100 * v).toFixed(2)}%`;

async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-two-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(files.length, 0, '输出目录非空，拒绝覆盖');
  const snapshot = await readFile('analysis/special6-only-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const name of ['tail-two.mjs', 'run-tail-two.mjs', 'model.mjs']) hashes[name] = hash(await readFile(new URL(name, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), hashes, dataSha256: hash(snapshot), configs: CONFIGS,
    year: 2026, trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    target: 'Before the draw, exclude exactly two distinct n7%10 tails. A draw succeeds iff neither excluded tail equals actual n7%10.',
    priors: 'Tail0 has probability4/49, tails1..9 each5/49 under uniform number draws. Frequency prior49; per-tail omission-bin prior50; transition prior20 centered on smoothed past100 distribution.',
    gaps: 'Gap is intervening draws since most recent special with that tail. Bins0,1,2–3,4–7,8–15,16+,never observed. Use pre-outcome gap to update exposures/hits. Longest-gap heuristic treats unseen gap as available history length.',
    selection: 'Maximize validation147–206 successes, ties follow declared order (fixed01 control first). No reselection using evaluation207–266. All models update only after observing the predicted outcome.',
    caveat: 'Exploratory reuse of previously examined history. Tail grouping is a new target, but these are not fresh independent outcomes. Null baseline is averaged over each forecast pair; no binomial p-value from the old15-number task is reused.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const report = { protocol, ...runTails(JSON.parse(snapshot)) };
  const rows = JSON.parse(snapshot), csv = ['model,split,period,actual,actual_tail,excluded_tails,success'];
  let audited = 0;
  for (const r of report.results) for (const split of ['validation', 'evaluation']) {
    assert.equal(r.details[split].length, 60);
    assert.deepEqual(r[split], tailStats(r.details[split]));
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
  const selected = report.results.find((r) => r.id === report.selectedId), s = selected.evaluation;
  const comparison = report.results.map((r) => `| ${r.label}${r.id === report.selectedId ? '（验证选定）' : ''} | ${r.validation.successes}/60 | ${r.evaluation.successes}/60 | ${pct(r.evaluation.rate)} | ${pct(r.evaluation.baseline)} |`).join('\n');
  const text = `# 排除特别码的两个尾数\n\n只使用2026年第1～266期快照，未声称包含当前最新开奖。每期在开奖前选择两个不同尾数；当期n7的个位数不在其中才算成功。\n\n` +
    `## 和排除6个号码的区别\n\n0尾包括10、20、30、40；1～9尾各有5个号码。排除含0尾的一对尾数等于排除9个号码，均匀独立开奖下成功率40/49＝81.63%；不含0尾等于排除10个号码，成功率39/49＝79.59%。如果从10个尾数中等概率随机选择一对，总体基线为80%。因此不能将本任务成功率与排除6个号码的87.76%基线直接混用。\n\n` +
    `## 规则与比较\n\n冷尾按平滑历史频率选最低两个；热尾反向按最高两个排除；最长遗漏是直接启发式，不假定它成立。遗漏条件模型统计各尾在相应遗漏区间后的出现率；转移模型统计上一期特别码尾数对应的下一期分布；综合模型平均近100期频率、遗漏条件和转移三种分布。均按尾数的号码数量设置先验，稀疏状态不赋零概率。\n\n` +
    `前146期初始化，147～206期选规则，207～266期逐期检验；先预测后更新。本轮8个规则及参数在计算结果前写入protocol.json，同分保留排列靠前的简单规则。\n\n| 方法 | 验证成功 | 后60期成功 | 后60期成功率 | 对应理论基线 |\n|---|---:|---:|---:|---:|\n${comparison}\n\n` +
    `验证选定：**${selected.label}**。后60期成功${s.successes}次、失败${s.failures}次，成功率${pct(s.rate)}，描述性95% Wilson区间${pct(s.ci95[0])}～${pct(s.ci95[1])}；最长连续失败${s.longestFailure}期。该区间未校正反复试验及模型选择，不代表未来保证。\n\n` +
    `失败期：${selected.details.evaluation.filter((d) => !d.success).map((d) => `${d.No}期（特别码${d.actual}，排除${d.excludedTails.join('、')}尾）`).join('；')}。\n\n` +
    `截至266期，该规则针对267期的历史快照输出为排除 **${[...selected.next.excludedTails].sort().join('、')}尾**，对应号码${selected.next.excludedNumbers.join('、')}。这是快照实验输出，不是对当前未开奖期次的实时推荐，也不能确保不出现。\n\n` +
    `这批数据已经反复用于前序实验，结果只能作为探索性比较；不根据后60期另挑胜者，不以尾数数量更少推断更容易预测。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-tail-two.mjs /tmp/tail-two-reproduction\`\n\n已逐条核对${audited}条预测；results.json保留所有规则、逐期结果及下一期快照输出，predictions.csv便于复查。\n`;
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  console.log(JSON.stringify({ selectedId: selected.id, comparison: report.results.map((r) => ({ id: r.id, label: r.label,
    validation: r.validation.successes, evaluation: r.evaluation.successes, baseline: r.evaluation.baseline })),
    selectedStats: s, nextSnapshot: selected.next, report: resolve(out, 'report.md') }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

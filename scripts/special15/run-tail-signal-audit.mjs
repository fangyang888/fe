import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { DESIGN, rng, shuffle, syntheticRows, frequencyStatistic, serialStatistic, driftStatistic, evaluateFamily, mcTail, quantiles } from './tail-signal-audit.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const pct = (p) => `${(p * 100).toFixed(2)}%`;
async function main() {
  const out = resolve(process.argv[2] || 'analysis/special-tail-signal-audit-2026');
  let files = [];
  try { files = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  assert.equal(files.length, 0, '拒绝覆盖旧实验');
  const snapshot = await readFile('analysis/special-tail-two-optimized-2026/snapshot.json', 'utf8');
  const hashes = {};
  for (const file of ['tail-signal-audit.mjs', 'run-tail-signal-audit.mjs', 'tail-two.mjs', 'tail-optimize.mjs', 'model.mjs']) hashes[file] = hash(await readFile(new URL(file, import.meta.url)));
  const protocol = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, ...DESIGN,
    uniformNull: 'Independently sample each special number uniformly1..49; tail0 mass4/49 and others5/49. Construct valid ordinary numbers deterministically because this limited model family never uses ordinary numbers. Retrain and evaluate all13 fixed models on each synthetic266-draw history; do not simply shuffle already-fixed forecasts.',
    permutationNull: 'Shuffle observed266 tails preserving marginal counts. Recompute maximum mutual information over fixed lags1..5 and three-block homogeneity statistic. Maximum-lag test includes search over these five lags; no other searched diagnostics are multiplicity-adjusted.',
    interpretation: 'Monte Carlo p=(exceedances+1)/(B+1); these are null exceedance estimates, not probabilities that randomness is true. Failure to reject is not proof of independence.13-rule family is only a partial illustration of selection effects, not full correction for every prior experiment or analyst adaptation.' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'protocol.json'), json(protocol));
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  const { rows, audit } = normalizeRows(JSON.parse(snapshot), 2026), tails = rows.map((r) => r.n7 % 10);
  assert.equal(rows.length, 266);
  const observed = { frequency: frequencyStatistic(tails), serial: serialStatistic(tails), drift: driftStatistic(tails), family: evaluateFamily(rows) };
  const old = JSON.parse(await readFile('analysis/special-tail-two-optimized-2026/results.json', 'utf8'));
  assert.equal(observed.family.incumbentSuccesses, old.results.find((r) => r.id === 'gap-prior20').evaluation.successes);
  for (const [file, expected] of Object.entries(old.protocol.hashes)) assert.equal(hash(await readFile(new URL(file, import.meta.url))), expected);
  const random = rng(DESIGN.seed), permRandom = rng(DESIGN.permutationSeed), simulations = [];
  for (let i = 0; i < DESIGN.simulations; i++) {
    const simulated = syntheticRows(random), st = simulated.map((r) => r.n7 % 10), family = evaluateFamily(simulated);
    const permuted = shuffle(tails, permRandom);
    simulations.push({ frequency: frequencyStatistic(st).statistic,
      permutedSerial: serialStatistic(permuted).statistic, permutedDrift: driftStatistic(permuted).statistic,
      incumbent: family.incumbentSuccesses, selected: family.selectedSuccesses, bestOf13: family.bestEvaluationSuccesses });
    if ((i + 1) % 250 === 0) console.log(`Completed ${i + 1}/${DESIGN.simulations} null histories`);
  }
  const values = (key) => simulations.map((r) => r[key]);
  const findings = {
    frequency: mcTail(values('frequency'), observed.frequency.statistic),
    serial: mcTail(values('permutedSerial'), observed.serial.statistic),
    drift: mcTail(values('permutedDrift'), observed.drift.statistic),
    incumbentAtLeastObserved: mcTail(values('incumbent'), observed.family.incumbentSuccesses),
    bestOf13AtLeastObserved: mcTail(values('bestOf13'), observed.family.bestEvaluationSuccesses),
    selectedAtLeastObserved: mcTail(values('selected'), observed.family.selectedSuccesses),
    selectedAtLeast95: mcTail(values('selected'), 57), bestOf13AtLeast95: mcTail(values('bestOf13'), 57),
    nullQuantiles: { incumbent: quantiles(values('incumbent')), selected: quantiles(values('selected')), bestOf13: quantiles(values('bestOf13')) },
  };
  const report = { protocol, audit, observed, findings };
  const text = `# 尾数信号与反复择模审计\n\n仅使用2026年第1～266期快照。本轮不新增排除规则，检查已有成绩与随机波动是否容易混淆。\n\n` +
    `## 尾数与时间结构\n\n| 检查 | 零假设模拟超越比例 |\n|---|---:|\n| 尾数频率偏离4/49、5/49 | ${pct(findings.frequency.probability)} |\n| 相隔1～5期最大互信息 | ${pct(findings.serial.probability)} |\n| 前中后三段尾数分布差异 | ${pct(findings.drift.probability)} |\n\n` +
    `频率检查使用${DESIGN.simulations}份独立均匀开奖模拟；另外两项打乱实际尾数次序、保留各尾总次数。互信息检验用五个滞后中的最大值，并在每次打乱时同样取最大值，处理了这五次比较；未声称校正此前全部研究选择。p值大不证明开奖随机，p值小也不等于可预测，更不能直接换算成杀尾成功率。\n\n` +
    `各尾总次数（0～9）：${observed.frequency.counts.join('、')}。\n\n` +
    `## 随机数据也能出现多少“好成绩”\n\n每份模拟重新训练和回测13个固定规则，不使用真实数据上已选好的预测列表代替重训。包含原8种规则和5个非重复遗漏变体。每种规则每期都杀两尾，仍按146期初始化、60期验证、60期检验。\n\n` +
    `| 比较 | 真实数据结果 | 随机模拟达到或超过的比例 |\n|---|---:|---:|\n| 单看原优化遗漏模型 | ${observed.family.incumbentSuccesses}/60 | ${pct(findings.incumbentAtLeastObserved.probability)} |\n| 验证段先选模型，再看后60期 | ${observed.family.selectedSuccesses}/60 | ${pct(findings.selectedAtLeastObserved.probability)} |\n| 看完后60期再挑13模型中的最好者 | ${observed.family.bestEvaluationSuccesses}/60 | ${pct(findings.bestOf13AtLeastObserved.probability)} |\n\n` +
    `完全随机的模拟中，验证先选模型后仍达到57/60（95%）的比例为${pct(findings.selectedAtLeast95.probability)}；看完后60期再挑最好者，达到57/60的比例为${pct(findings.bestOf13AtLeast95.probability)}。这说明一次高回测成绩和可持续预测能力不是同一回事；这些比例不是未来成功率。\n\n` +
    `这只是固定13种方法范围内的对照，没有重现我们全部历史实验和根据结果继续发明方法的过程，不能称为完整的多重试验校正。模拟次数2000，比例估计本身也存在Monte Carlo误差，最不利情况下标准误约1.12个百分点。\n\n` +
    `## 原模型跨段表现\n\n147～206期的三个20期分段：${observed.family.results.find((r) => r.id === 'gap-prior20').validationBlocks.join('/')}；207～266期：${observed.family.results.find((r) => r.id === 'gap-prior20').evaluationBlocks.join('/')}。每段分母均为20，不能只保留最好的一段。\n\n` +
    `## 下一步的证据要求\n\n若没有清楚且可复现的信号，继续在这266期上追逐95%容易挑中偶然表现。更可靠的是固定一个规则及评估长度，在新增开奖揭晓前保存预测。仅凭本审计不能证明完全不存在可预测信息，也没有证明能够达到95%。\n\n` +
    `## 复现\n\n\`node scripts/special15/run-tail-signal-audit.mjs /tmp/tail-signal-audit-reproduction\`\n\nprotocol.json保存固定种子、检验定义和源码哈希；simulations.json保存全部模拟汇总；results.json保存真实数据与比较结果。\n`;
  await writeFile(resolve(out, 'results.json'), json(report));
  await writeFile(resolve(out, 'simulations.json'), json(simulations));
  await writeFile(resolve(out, 'report.md'), text);
  console.log(json({ findings, blocks: observed.family.results.find((r) => r.id === 'gap-prior20'), report: resolve(out, 'report.md') }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

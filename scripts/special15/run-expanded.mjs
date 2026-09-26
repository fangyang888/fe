import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeTwoYears, makeExpandedProtocol, runExpanded } from './expanded-models.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const pct = (value) => `${(value * 100).toFixed(2)}%`;
const nums = (values) => values.map((n) => String(n).padStart(2, '0')).join('、');
const names = {
  'frequency-30': '近30期频率', 'frequency-100': '近100期频率',
  'logistic-l2-0.01': '逻辑回归 L2=0.01', 'logistic-l2-0.1': '逻辑回归 L2=0.1',
  'knn-15': 'KNN 15邻居', 'knn-30': 'KNN 30邻居',
  'markov-shrink-50': '平滑转移模型', 'gap-hazard-100': '遗漏间隔模型',
  'boosted-stumps-32': '32棵浅层提升树', 'consensus-two-stage': '六模型共同筛选',
};
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [file2025, file2026, output = 'analysis/special10-expanded-2025-2026'] = process.argv.slice(2);
  if (!file2025 || !file2026) throw new Error('用法：node scripts/special15/run-expanded.mjs 2025.json 2026.json [输出目录]');
  const out = resolve(output);
  let existing = [];
  try { existing = await readdir(out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing.length) throw new Error('输出目录非空，拒绝覆盖既有实验');
  const data2025 = JSON.parse(await readFile(resolve(file2025), 'utf8'));
  const data2026 = JSON.parse(await readFile(resolve(file2026), 'utf8'));
  const { rows, audit } = normalizeTwoYears([...data2025, ...data2026]);
  const snapshot = JSON.stringify(rows, null, 2) + '\n';
  const protocol = makeExpandedProtocol(rows);
  const hashes = {};
  for (const name of ['model.mjs', 'exclusion.mjs', 'expanded-models.mjs', 'run-expanded.mjs']) {
    hashes[name] = hash(await readFile(resolve(here, name)));
  }
  const metadata = { createdAt: new Date().toISOString(), dataSha256: hash(snapshot), hashes, audit,
    sourceFiles: [resolve(file2025), resolve(file2026)], sourceApi: 'http://47.106.103.79/api/history' };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  // Save design before scoring any real validation or evaluation result.
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify({ ...metadata, ...protocol }, null, 2) + '\n');
  const report = { ...metadata, protocol, ...runExpanded(rows, protocol, (p) => console.log(JSON.stringify(p))) };
  const selected = report.results.find((r) => r.id === report.selectedId);
  const s = selected.evaluation.final10;
  const csv = ['model,split,year,period,actual,pool20,excluded10,success20,success10'];
  for (const model of report.results) {
    for (const split of ['validation', 'evaluation']) {
      for (const row of model.details[split]) csv.push([model.id, split, row.year, row.No, row.actual,
        row.pool20.join(' '), row.excluded10.join(' '), Number(row.success20), Number(row.success10)].join(','));
    }
  }
  const comparison = report.results.map((r) => `| ${names[r.id]}${r.id === report.selectedId ? '（2025选定）' : ''} | ${r.validation.successes}/${r.validation.count} (${pct(r.validation.rate)}) | ${r.evaluation.final10.successes}/${r.evaluation.final10.count} (${pct(r.evaluation.final10.rate)}) | ${r.evaluation.final10.failures} |`).join('\n');
  const selectedFailures = selected.details.evaluation.filter((r) => !r.success10);
  const conclusion = s.pAgainstRandom < 0.05
    ? '这段历史成绩高于随机基线，但设计已受到此前2026年研究影响，需未来新开奖独立验证，不能承诺100%。'
    : '本轮没有足够证据证明选定模型优于随机排除10个，增加数据与复杂度并未得到100%成功的规则。';
  const text = `# 特别码排除10个：2025＋2026扩展实验\n\n` +
    `共 ${rows.length} 期：2025年365期、2026年第1～${rows.at(-1).No}期。目标仍是先筛20个，再从中取10个，**10个全部避开n7才算该期成功**。每期必须输出10个，没有跳过失败期或仅报告出手期。\n\n` +
    `## 结果\n\n仅根据2025年验证段选定 **${names[selected.id]}（${selected.id}）**。2026年成功 **${s.successes}/${s.count}（${pct(s.rate)}）**，失败 **${s.failures}期**；随机理论基线为 **${pct(39 / 49)}**，差值 ${(s.excess * 100).toFixed(2)} 个百分点。\n\n` +
    `95% Wilson区间：${pct(s.ci95[0])}～${pct(s.ci95[1])}；最长连续失败 ${s.longestFailure} 期；相对39/49的单侧二项检验 p=${s.pAgainstRandom.toFixed(4)}（探索性描述，不代表前瞻确认）。${conclusion}\n\n` +
    `## 固定划分\n\n- 训练：${protocol.training}。\n- 配置选择：${protocol.validation}。\n- 时间向前检验：${protocol.evaluation}。\n- 验证结束时锁定模型，之后逐期先预测、再吸收已揭晓结果；不按2026成绩更换配置。\n- 所有特征只看目标期之前，跨年可用2025年的历史；不使用2023、2024年数据，也不使用目标期的前六个号码。\n- 2026数据此前已被查看，这是探索性跨年检验，不是整个项目从未看过的新测试集。\n- 参数在本轮成绩计算前写入protocol.json，没有在看到成绩后反复搜索。\n\n` +
    `## 全部方法对比\n\n| 方法 | 2025后120期成功 | 2026排除10个成功 | 2026失败期数 |\n|---|---:|---:|---:|\n${comparison}\n\n` +
    `其他配置的2026成绩只作诊断，不能把2026成绩最高者事后替换成预先选定模型。\n\n` +
    `## 新方法如何工作\n\n` +
    `- 平滑转移模型：分别统计“上期特别码→下期特别码”和“上期特别码尾数→下期特别码”，用历史总体频率作收缩先验，防止少量转移记录产生极端判断。\n` +
    `- 遗漏间隔模型：按遗漏0、1～2、3～5、6～10、11～20、21～50、51期以上分组，估计条件出现率；从未见过的号码单独处理，并对单号码估计做收缩。不会预设“遗漏久就必出”。\n` +
    `- 浅层提升树：自实现32棵深度1树的Newton梯度提升，12维候选特征，固定分箱和正则化，每20期重新训练，最多使用过去365个有效标签。不是调用XGBoost，也没有做大型参数搜索。\n` +
    `- 六模型共同筛选：先按六个模型的平均风险排名取最低20个，再按每个号码在六模型中的最高风险排名选10个，避免某个模型认为高风险的号码被轻易排除。这一方法两阶段使用不同标准。\n\n` +
    `原频率、逻辑回归和KNN作为对照保留。其20→10两阶段使用同一分数，等价于直接取最低10个。所有分数只用于排序，不宣称是已校准的未来概率。\n\n` +
    `## 选定模型的稳定性\n\n| 2026期号 | 成功次数 | 成功率 |\n|---|---:|---:|\n` +
    selected.blocks.map((b) => `| ${b.from}～${b.to} | ${b.successes}/${b.count} | ${pct(b.rate)} |`).join('\n') +
    `\n\n| 最近窗口 | 成功次数 | 成功率 |\n|---|---:|---:|\n` +
    selected.recent.map((b) => `| 近${b.requested}期（实际${b.count}期） | ${b.successes}/${b.count} | ${pct(b.rate)} |`).join('\n') +
    `\n\n选定模型最早几次失败（实际n7落入排除集合）：${selectedFailures.slice(0, 5).map((r) => `第${r.No}期 n7=${String(r.actual).padStart(2, '0')}`).join('；') || '无'}。全部成功与失败均保留在逐期明细中。\n\n` +
    `## 下一期实验排除结果\n\n截至2026年第${rows.at(-1).No}期，预测此后下一期。最终10个：\n\n**${nums(selected.next.ascending10)}**\n\n` +
    `第一阶段20个池：${nums([...selected.next.pool20].sort((a, b) => a - b))}。\n\n这是验证段选定模型的实验输出，不是保证不会出现的号码。\n\n` +
    `## 复现与依据\n\n快照SHA-256：\`${metadata.dataSha256}\`。旧实验文件未修改。\n\n` +
    `\`node scripts/special15/run-expanded.mjs ${output}/snapshot.json ${output}/snapshot.json /tmp/special10-expanded-reproduction\`\n\n` +
    `复现可将同一合并快照传入两次，规范化会去除完全相同记录，预测结果不变。\n\n` +
    `方法参考：[梯度提升与正则化叶值](https://scikit-learn.org/stable/modules/ensemble.html#gradient-boosting)、[按时间顺序验证](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)。这些资料说明算法方法，不提供彩票预测有效性的证据。\n`;
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ model: selected.id, generatedAt: metadata.createdAt,
    dataSha256: metadata.dataSha256, role: 'exclude-not-pick', exploratory: true,
    evidence2026: s, ...selected.next }, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), text);
  console.log(JSON.stringify({ selected: selected.id,
    comparison: report.results.map((r) => ({ id: r.id, validation: r.validation.successes,
      evaluationCount: r.evaluation.final10.count, evaluationSuccess: r.evaluation.final10.successes,
      rate: r.evaluation.final10.rate })),
    selectedMetrics: s, next: selected.next.ascending10, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });

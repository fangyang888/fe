import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeRows, makeProtocol, runExperiment, BASE_RATE } from './model.mjs';

const pct = (n) => `${(n * 100).toFixed(2)}%`;
const nums = (values) => values.map((n) => String(n).padStart(2, '0')).join('、');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = { year: 2026, out: 'analysis/special15-2026' };
  const allowed = new Set(['input', 'url', 'year', 'out', 'source-label']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || !allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`无效参数 ${argv[i]}；使用 --input 文件 或 --url 接口，可选 --year 2026 --out 目录`);
    }
    options[key] = argv[i + 1];
  }
  options.year = Number(options.year);
  if (!Number.isInteger(options.year) || options.year < 2000 || options.year > 2100) throw new Error('年份无效');
  if (Boolean(options.input) === Boolean(options.url)) throw new Error('--input 与 --url 必须且只能提供一个');
  return options;
}

function renderReport(report) {
  const { protocol: p, results, selectedId } = report;
  const selected = results.find((r) => r.id === selectedId);
  const s = selected.test;
  const table = results.map((r) => `| ${r.id}${r.id === selectedId ? '（验证集选定）' : ''} | ${r.validation.hits}/${r.validation.count} (${pct(r.validation.rate)}) | ${r.test.hits}/${r.test.count} (${pct(r.test.rate)}) | ${r.test.longestMiss} |`).join('\n');
  const proven = s.pAgainstRandom < 0.05;
  return `# ${p.year} 年特别码 Top-15 离线实验\n\n` +
    `仅使用 ${p.year} 年第 ${report.audit.first}～${report.audit.last} 期，共 ${report.audit.valid} 期。预测目标仅为下一期 n7；预测前不能看到当期任何开奖号。\n\n` +
    `数据来源：${report.source}。读取时间：${report.retrievedAt}。数据 SHA-256：\`${report.dataSha256}\`。\n\n` +
    `## 结论\n\n验证区间选定 **${selectedId}**，最终测试命中 **${s.hits}/${s.count}（${pct(s.rate)}）**；随机理论基线为 **${pct(BASE_RATE)}**。95% Wilson 区间为 ${pct(s.ci95[0])}～${pct(s.ci95[1])}，最长连续未命中 ${s.longestMiss} 期。\n\n` +
    `对固定选定模型与独立均匀开奖假设作单侧二项检验，p=${s.pAgainstRandom.toFixed(4)}。${proven ? '本次留出区间高于随机基线，但仍须未来开奖验证，不能视为稳定预测能力。' : '本次测试没有足够证据证明优于随机选 15 个号码。'}\n\n` +
    `## 时间划分与规则\n\n` +
    `- 前 ${p.warmup} 期用于构建历史特征，不作为训练标签。\n` +
    `- 训练：第 ${p.training.from}～${p.training.to} 期；有效目标标签 ${p.trainingLabels.count} 期（第 ${p.trainingLabels.from}～${p.trainingLabels.to} 期）。每期 49 行候选特征仍然只代表一期开奖，不能当成 49 个独立样本。\n` +
    `- 验证：第 ${p.validation.from}～${p.validation.to} 期，${p.validation.count} 期；只用这段选配置。并列按预设配置顺序处理。\n` +
    `- 最终测试：第 ${p.test.from}～${p.test.to} 期，${p.test.count} 期；模型配置锁定，先预测、后吸收已揭晓结果。\n` +
    `- 逻辑回归初始训练 40 轮，随后每期更新一次；KNN 只追加已知结果的历史状态。所有年份过滤、特征和状态只使用 ${p.year} 年的数据。\n` +
    `- 配置已在计算成绩前写入 protocol.json。其他模型的最终测试成绩仅作诊断，不按测试成绩改选模型。\n` +
    `- 这是脚本内的历史留出实验；仓库此前可能已分析过这些开奖，不声称它们是整个项目从未看过的数据。\n\n` +
    `## 模型对比\n\n| 配置 | 验证命中 | 最终测试命中 | 测试最长连失 |\n|---|---:|---:|---:|\n${table}\n\n` +
    `频率法为带均匀先验的特别码频率。逻辑回归为共享参数的候选号码二分类评分器，使用近 10/30/100 期特别码与普通号频率、两类遗漏、上期状态和短长频率差，共 12 维；不将号码大小当成连续数值。KNN 用近 30 期特别码与普通号频率构成 98 维状态，分块归一化后取欧氏距离最近的 15/30 个状态，用其下一期开奖结果作距离加权投票。所有方法都输出 15 个不重复号码。分数只用于排序。\n\n` +
    `## 选定模型最近表现（仅最终测试段）\n\n| 请求窗口 | 实际评估期数 | 命中 | 命中率 |\n|---|---:|---:|---:|\n` +
    selected.recentTest.map((m) => `| 近 ${m.requested} 期 | ${m.count}${m.count < m.requested ? '（不足请求窗口）' : ''} | ${m.hits} | ${pct(m.rate)} |`).join('\n') +
    `\n\n区间和检验只描述这段有限历史，不能保证未来表现。遗漏、频率与相似性都是被检验的特征，不代表号码必然回归。\n\n` +
    `## 下一期实验候选\n\n截至 ${p.year} 年第 ${report.audit.last} 期；预测对象是此后下一期，运行前应核实接口是否已更新。\n\n` +
    `按分数排序：**${nums(selected.next.picks)}**\n\n按号码排序：**${nums(selected.next.ascending)}**\n\n` +
    `这些是实验输出，不是经证实具有优势的推荐。未用最终测试重新选择模型，也未用所有已知数据从头重新调参。\n\n` +
    `## 复现与文件\n\n\`node scripts/special15/run.mjs --input ${report.outputDirectory}/snapshot.json --year ${p.year} --out /tmp/special15-reproduction\`\n\n` +
    `- snapshot.json：仅本年度的规范化开奖快照。\n- protocol.json：固定划分、模型配置、数据与代码哈希。\n- results.json：完整指标、所有配置的逐期预测与下一期候选。\n- predictions.csv：验证段与测试段的逐期明细。\n- next.json：验证区间选定模型的下一期输出及数据截止期号。\n\n` +
    `如改变配置或重新选择截止期号，必须视作新实验；反复查看同一段测试结果后调参会使它失去独立检验意义。后续效果应通过开奖前留存候选、新开奖后核对来确认。\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out);
  let existing = [];
  try { existing = await readdir(out); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing.length) throw new Error(`输出目录非空，拒绝覆盖已有实验：${out}；请使用新的 --out 目录`);
  let text, source;
  if (args.input) {
    text = await readFile(resolve(args.input), 'utf8');
    source = args['source-label'] || resolve(args.input);
  } else {
    const url = new URL(args.url);
    url.searchParams.set('year', String(args.year));
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`读取接口失败 HTTP ${response.status}`);
    text = await response.text();
    source = url.toString();
  }
  const { rows, audit } = normalizeRows(JSON.parse(text), args.year);
  const snapshot = JSON.stringify(rows, null, 2) + '\n';
  const protocol = makeProtocol(rows);
  const metadata = { source, audit, retrievedAt: new Date().toISOString(),
    outputDirectory: args.out, dataSha256: sha256(snapshot),
    modelSha256: sha256(await readFile(resolve(here, 'model.mjs'))),
    runnerSha256: sha256(await readFile(resolve(here, 'run.mjs'))) };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'snapshot.json'), snapshot);
  // Persist the protocol BEFORE any scores are computed.
  await writeFile(resolve(out, 'protocol.json'), JSON.stringify({ ...metadata, ...protocol }, null, 2) + '\n');
  console.log(`仅使用 ${args.year} 年 ${rows.length} 期；训练 ${protocol.training.count}，验证 ${protocol.validation.count}，测试 ${protocol.test.count}。`);
  const report = { ...metadata, ...runExperiment(rows, protocol) };
  const csv = ['model,split,year,period,actual,picks_ranked,hit'];
  for (const result of report.results) {
    for (const split of ['validation', 'test']) {
      for (const row of result.details[split]) {
        csv.push([result.id, split, row.year, row.No, row.actual, row.picks.join(' '), Number(row.hit)].join(','));
      }
    }
  }
  const selected = report.results.find((r) => r.id === report.selectedId);
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'predictions.csv'), csv.join('\n') + '\n');
  await writeFile(resolve(out, 'next.json'), JSON.stringify({ generatedAt: metadata.retrievedAt,
    dataSha256: metadata.dataSha256, selectedBy: 'validation-only', model: selected.id,
    evidence: selected.test, ...selected.next }, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), renderReport(report));
  console.log(JSON.stringify({ selected: report.selectedId,
    comparison: report.results.map((r) => ({ model: r.id, validation: r.validation, test: r.test })),
    next: selected.next.ascending, report: resolve(out, 'report.md') }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

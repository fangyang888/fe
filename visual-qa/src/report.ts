import { promises as fs } from "node:fs";
import path from "node:path";
import type { VerificationReport } from "./types.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

/** Render existing evidence only; never infer final acceptance from pixel metrics. */
export function verificationReportToHtml(report: VerificationReport, htmlPath: string): string {
  const link = (file: string) => escapeHtml(path.relative(path.dirname(htmlPath), file)
    .split(path.sep).map(encodeURIComponent).join("/"));
  const complete = report.status === "passed" && report.mode === "final";
  const metrics = report.comparison;
  const panels = [
    ["设计", report.artifacts.design], ["实现", report.artifacts.actual], ["差异", report.artifacts.diff],
  ].map(([label, file]) => `<section><h2>${label}</h2><img src="${link(file!)}" alt="${label}" /></section>`);
  const iteration = metrics.regionIteration;
  const diagnostics = `<details><summary>区域诊断（候选关联，不代表根因）</summary>
<p>坐标为截图物理像素；DOM 样式使用 CSS 单位。跨轮统计针对固定区域，不代表组件身份跟踪。</p>
${report.workflow?.recommendation ? `<p>${escapeHtml(report.workflow.recommendation)}</p>` : ""}
${metrics.domDiagnosticsWarning ? `<p>${escapeHtml(metrics.domDiagnosticsWarning)}</p>` : ""}
${iteration ? `<p>基线重置：${iteration.baselineReset} · 新增 ${iteration.counts.new} · 改善 ${iteration.counts.improved} · 恶化 ${iteration.counts.worsened} · 解决 ${iteration.counts.resolved} · 未变化 ${iteration.counts.unchanged}${iteration.truncated ? " · 跟踪列表已截断" : ""}</p>` : ""}
<pre>${escapeHtml(JSON.stringify({ regions: metrics.differenceRegions, iteration: iteration?.regions,
    criticalRegions: metrics.criticalRegions }, null, 2))}</pre></details>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(report.name)} · Visual QA</title>
<style>body{margin:24px;background:#f4f4f4;color:#222;font:14px system-ui}h1{font-size:22px}main{display:flex;gap:20px;align-items:flex-start;overflow:auto}section{flex:0 0 auto;max-width:100%}img{display:block;max-width:100%;height:auto;background:white}h2{font-size:16px}p{line-height:1.6}</style>
<h1>${escapeHtml(report.name)} · ${complete ? "最终验收通过" : "首版 / 迭代对比，未通过最终验收"}</h1>
<p>${escapeHtml(report.generatedAt)} · status=${escapeHtml(report.status)} · mode=${escapeHtml(report.mode)}<br />
Mismatch：${escapeHtml(metrics.mismatchPercent)}% · SSIM：${escapeHtml(metrics.ssim ?? "未计算")} · 本轮总耗时：${escapeHtml(report.timings.totalMs)} ms<br />
此展示仅对应报告生成时的页面，不执行新验收。<a href="${link(report.artifacts.report)}">原始报告与分阶段耗时</a></p>
${diagnostics}<main>${panels.join("\n")}</main></html>`;
}

export async function writeVerificationReport(report: VerificationReport): Promise<void> {
  report.artifacts.html = path.join(path.dirname(report.artifacts.report), "comparison.html");
  await fs.writeFile(report.artifacts.html, verificationReportToHtml(report, report.artifacts.html), "utf8");
  await fs.writeFile(report.artifacts.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

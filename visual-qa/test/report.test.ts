import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { verificationReportToHtml, writeVerificationReport } from "../src/report.js";
import type { VerificationReport } from "../src/types.js";

function fixture(directory: string): VerificationReport {
  return {
    name: '<script>alert("x")</script>', generatedAt: "2026-09-11T00:00:00Z",
    status: "passed", mode: "agent", comparison: { mismatchPercent: 0, ssim: 1 },
    artifacts: { design: path.join(directory, "design image.png"), actual: path.join(directory, "actual.png"), diff: path.join(directory, "diff.png"), report: path.join(directory, "report.json") },
    timings: { totalMs: 12 },
  } as VerificationReport;
}

test("HTML escapes data, encodes local paths and does not promote an agent pass", () => {
  const report = fixture("/tmp/evidence");
  const html = verificationReportToHtml(report, "/tmp/evidence/comparison.html");
  assert.ok(html.includes("design%20image.png"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("未通过最终验收"));
  report.mode = "final";
  assert.ok(verificationReportToHtml(report, "/tmp/evidence/comparison.html").includes("最终验收通过"));
  report.status = "failed";
  assert.ok(verificationReportToHtml(report, "/tmp/evidence/comparison.html").includes("未通过最终验收"));
});

test("report writer persists HTML path and replaces stale passing presentation on failure", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-report-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const report = fixture(directory);
  report.mode = "final";
  await writeVerificationReport(report);
  report.status = "failed";
  await writeVerificationReport(report);
  const stored = JSON.parse(await fs.readFile(report.artifacts.report, "utf8"));
  assert.equal(stored.artifacts.html, path.join(directory, "comparison.html"));
  assert.equal(stored.status, "failed");
  assert.ok((await fs.readFile(stored.artifacts.html, "utf8")).includes("未通过最终验收"));
});

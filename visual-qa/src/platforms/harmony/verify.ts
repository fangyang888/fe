import { promises as fs } from "node:fs";
import path from "node:path";
import { compareScreenshots, writeComparisonCrops } from "../../compare.js";
import type { ComparisonResult, HarmonyCase, VerificationOptions } from "../../types.js";
import { captureHarmonyScreenshot, type HarmonyCapture, type HarmonyCaptureOptions } from "./capture.js";
import { HarmonyError, type HarmonyStage } from "./device.js";

export interface HarmonyReport {
  schemaVersion: 1;
  platform: "harmony";
  scope: "native-screenshot-visual-only";
  name: string;
  generatedAt: string;
  status: "passed" | "failed";
  mode: "quick" | "agent" | "final";
  capture?: HarmonyCapture;
  comparison?: ComparisonResult;
  failure?: { stage: HarmonyStage; code: string; message: string };
  checks: Record<string, string>;
  cache: { verificationReused: false; reason: string };
  ai: { shouldAnalyze: boolean; reason: string };
  artifacts: { design: string; report: string; raw?: string; actual?: string; diff?: string; diagnosticCrops?: string[] };
  timings: { totalMs: number };
}
export async function verifyHarmonyCase(c: HarmonyCase, options: VerificationOptions & HarmonyCaptureOptions = {}): Promise<HarmonyReport> {
  if (options.mode === "adaptive") {
    throw new Error("Adaptive verification is only supported for Web cases");
  }
  const started = Date.now();
  const output = path.resolve(c.outputDir!);
  await fs.mkdir(output, { recursive: true });
  const report: HarmonyReport = {
    schemaVersion: 1, platform: "harmony", scope: "native-screenshot-visual-only", name: c.name,
    generatedAt: new Date().toISOString(), status: "failed", mode: options.mode ?? "final",
    checks: { visual: "not-run", dom: "not-applicable", css: "not-applicable", structure: "not-implemented", nativeMeasurement: "not-implemented", fonts: "not-checked", images: "not-checked", console: "not-checked" },
    cache: { verificationReused: false, reason: "Device state and imported pixels are re-read on every run" },
    ai: { shouldAnalyze: false, reason: "Capture has not completed" },
    artifacts: { design: c.designImage, report: path.join(output, "report.json") }, timings: { totalMs: 0 },
  };
  let stage: HarmonyStage = "preparation";
  // Each run captures into a unique directory so old evidence cannot be mistaken for this run.
  const evidence = await fs.mkdtemp(path.join(output, "capture-"));
  try {
    if (options.browser || options.browserEndpoint || options.changedOnly) throw new HarmonyError("preparation", "UNSUPPORTED_OPTION", "Harmony does not support browser options or changed-only comparison");
    stage = "capture";
    report.capture = await captureHarmonyScreenshot(c, path.join(evidence, "actual.png"), options);
    report.artifacts.raw = report.capture.rawPath;
    report.artifacts.actual = report.capture.outputPath;
    stage = "alignment";
    // Comparator rejects unequal dimensions; no implicit resizing or reference substitution.
    const diff = path.join(evidence, "diff.png");
    report.comparison = await compareScreenshots(c.designImage, report.capture.outputPath, diff, {
      ...c.thresholds, computeSsim: report.mode !== "quick", analyzeDifferenceRegions: report.mode !== "quick",
      topRegions: options.topRegions ?? (report.mode === "agent" ? 2 : 3),
    });
    stage = "comparison";
    report.artifacts.diff = diff;
    report.status = report.comparison.passed ? "passed" : "failed";
    report.checks.visual = report.status;
    report.ai = { shouldAnalyze: !report.comparison.passed && report.mode !== "quick", reason: report.comparison.passed ? "Screenshot comparison passed within the declared visual-only scope" : "Inspect screenshot differences; native structure and runtime checks were not performed" };
    if (report.ai.shouldAnalyze && report.comparison.differenceRegions.length) {
      report.artifacts.diagnosticCrops = await writeComparisonCrops(c.designImage, report.capture.outputPath, report.comparison.differenceRegions, path.join(evidence, "diagnostics"));
    }
  } catch (error) {
    report.status = "failed";
    report.failure = { stage: error instanceof HarmonyError ? error.stage : stage, code: error instanceof HarmonyError ? error.code : "NATIVE_VERIFICATION_ERROR", message: error instanceof Error ? error.message : String(error) };
    report.ai = { shouldAnalyze: false, reason: "Resolve the reported environment, preparation, or capture failure first" };
    const raw = path.join(evidence, "raw.png");
    if (await fs.stat(raw).then(() => true, () => false)) report.artifacts.raw = raw;
  }
  report.timings.totalMs = Date.now() - started;
  await fs.writeFile(report.artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

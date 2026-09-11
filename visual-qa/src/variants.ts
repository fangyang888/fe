import { promises as fs } from "node:fs";
import path from "node:path";
import { readVisualCase } from "./config.js";
import { collectCodeState, hashFile } from "./cache.js";
import { runVisualSuite, SuiteBrowserPool } from "./suite.js";
import { verifyVisualCase } from "./verify.js";
import type { VerificationReport } from "./types.js";

export interface CssVariant { name: string; css: string }

export function parseVariants(input: unknown): CssVariant[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) {
    throw new Error("variants must contain 1–32 explicit CSS candidates");
  }
  const names = new Set(["baseline"]);
  return input.map(value => {
    if (!value || typeof value.name !== "string" || !value.name.trim() ||
        typeof value.css !== "string" || !value.css.trim()) {
      throw new Error("Each variant requires a name and non-empty css string");
    }
    const name = value.name.trim();
    if (names.has(name)) throw new Error(`Duplicate or reserved variant name: ${name}`);
    names.add(name);
    return { name, css: value.css };
  });
}

export function eligibleForRanking(report: VerificationReport): boolean {
  const c = report.capture;
  return c.readiness.fontsReady && c.readiness.layoutStable &&
    c.readiness.imagesFailed.length === 0 && c.consoleErrors.length === 0 &&
    (!c.structure || c.structure.passed) && (!c.cssRules || c.cssRules.passed) &&
    (!c.measurement || c.measurement.passed);
}

export async function runCssVariants(configPath: string, concurrencyOverride?: number) {
  const started = Date.now();
  const base = path.dirname(path.resolve(configPath));
  const input = JSON.parse(await fs.readFile(configPath, "utf8"));
  const variants = parseVariants(input.variants);
  const concurrency = concurrencyOverride ?? input.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("concurrency must be an integer between 1 and 8");
  }
  if (typeof input.case !== "string" || !input.case.trim()) throw new Error("case is required");
  if (typeof input.outputDir !== "string" || !input.outputDir.trim()) throw new Error("outputDir is required");
  const visualCase = await readVisualCase(path.resolve(base, input.case));
  if (visualCase.platform === "harmony") throw new Error("CSS variants require a Web case");
  const projectRoot = path.resolve(input.projectRoot ? path.resolve(base, input.projectRoot) :
    visualCase.changeDetection?.projectRoot ?? process.cwd());
  // One source scan and design hash per batch, not per candidate.
  const [preparedCodeState, preparedDesignHash] = await Promise.all([
    collectCodeState(projectRoot, visualCase.changeDetection?.baseRef ?? "HEAD"),
    hashFile(visualCase.designImage),
  ]);
  const outputRoot = path.resolve(base, input.outputDir);
  await fs.mkdir(outputRoot, { recursive: true });
  const outputDir = await fs.mkdtemp(path.join(outputRoot, "variants-"));
  const candidates = [{ name: "baseline", css: "" }, ...variants];
  const cases = await Promise.all(candidates.map(async (variant, index) => {
    const casePath = path.join(outputDir, `${index}.json`);
    await fs.writeFile(casePath, JSON.stringify({
      ...visualCase,
      name: variant.name,
      styleOverrides: [visualCase.styleOverrides ?? "", variant.css].join("\n"),
      outputDir: path.join(outputDir, String(index)),
    }, null, 2));
    return casePath;
  }));
  const suitePath = path.join(outputDir, "suite.json");
  await fs.writeFile(suitePath, JSON.stringify({
    schemaVersion: 1, name: `${visualCase.name}-variants`, outputDir, concurrency,
    failFast: false, defaults: { mode: "final", reuseVerification: false, noAiOnPass: true }, cases,
  }, null, 2));
  const pool = new SuiteBrowserPool();
  const reports = new Map<string, VerificationReport>();
  let suite;
  try {
    suite = await runVisualSuite(suitePath, {
      runCase: async casePath => {
        const candidate = await readVisualCase(casePath);
        if (candidate.platform === "harmony") throw new Error("Expected Web case");
        const report = await verifyVisualCase(candidate, {
          browser: await pool.acquire(candidate.browserChannel), mode: "final",
          reuseVerification: false, noAiOnPass: true, projectRoot,
          cachePath: path.join(candidate.outputDir!, "cache.json"),
          preparedCodeState, preparedDesignHash,
        });
        reports.set(casePath, report);
        return report;
      },
    });
  } finally {
    await pool.close();
  }
  const baseline = suite.cases[0]!;
  const ranking = suite.cases.map(result => ({
    ...result,
    eligible: reports.has(result.casePath) && eligibleForRanking(reports.get(result.casePath)!),
    improvementPercentagePoints: typeof baseline.mismatchPercent === "number" &&
      typeof result.mismatchPercent === "number" ? baseline.mismatchPercent - result.mismatchPercent : null,
    css: candidates[result.index]!.css,
  })).sort((a, b) => Number(b.eligible) - Number(a.eligible) ||
    (a.mismatchPercent ?? Infinity) - (b.mismatchPercent ?? Infinity) ||
    (b.ssim ?? -1) - (a.ssim ?? -1) || a.index - b.index);
  const best = ranking.find(result => result.eligible);
  const reportPath = path.join(outputDir, "ranking.json");
  const result = {
    status: best?.status === "passed" ? "passed" : "failed",
    scope: "temporary-css-experiment; apply selected CSS and reverify source before delivery",
    best: best?.name ?? null, ranking,
    artifacts: { ...suite.artifacts, ranking: reportPath },
    timings: { totalMs: Date.now() - started },
  };
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
  return result;
}

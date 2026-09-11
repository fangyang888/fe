import { promises as fs } from "node:fs";
import path from "node:path";
import type { Browser } from "playwright";
import { launchVisualQaBrowser } from "./capture.js";
import { readVisualCase } from "./config.js";
import type { HarmonyReport } from "./platforms/harmony/verify.js";
import type {
  VerificationOptions,
  VerificationReport,
} from "./types.js";
import { verifyVisualCase } from "./verify.js";

export type SuiteVerificationSettings = Pick<
  VerificationOptions,
  | "pageReady"
  | "mode"
  | "reuseVerification"
  | "browserEndpoint"
  | "changedOnly"
  | "topRegions"
  | "reuseDesign"
  | "noAiOnPass"
  | "projectRoot"
>;

export interface VisualSuiteCase {
  casePath: string;
  label?: string;
  options: SuiteVerificationSettings;
}

export interface VisualSuite {
  schemaVersion: 1;
  name: string;
  sourcePath: string;
  outputDir: string;
  concurrency: number;
  failFast: boolean;
  defaults: SuiteVerificationSettings;
  cases: VisualSuiteCase[];
}

export interface SuiteCaseResult {
  index: number;
  casePath: string;
  name: string;
  platform?: "web" | "harmony";
  status: "passed" | "failed" | "error" | "skipped";
  durationMs: number;
  reportPath?: string;
  artifacts?: {
    report: string;
    design?: string;
    actual?: string;
    diff?: string;
    diagnosticCrops?: string[];
  };
  mismatchPercent?: number;
  ssim?: number | null;
  message?: string;
}

export interface SuiteReport {
  schemaVersion: 1;
  kind: "visual-qa-suite-report";
  name: string;
  generatedAt: string;
  status: "passed" | "failed";
  sourcePath: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
  };
  cases: SuiteCaseResult[];
  artifacts: { report: string; junit: string; html: string };
  timings: { totalMs: number };
}

export type SuiteCaseRunner = (
  casePath: string,
  options: SuiteVerificationSettings,
) => Promise<VerificationReport | HarmonyReport>;

export interface RunSuiteOptions {
  concurrency?: number;
  failFast?: boolean;
  reportPath?: string;
  junitPath?: string;
  htmlPath?: string;
  verification?: SuiteVerificationSettings;
  runCase?: SuiteCaseRunner;
}

export type SuiteBrowserLauncher = (
  channel?: "chrome" | "chromium" | "msedge",
) => Promise<Browser>;

export class SuiteBrowserPool {
  private readonly browsers = new Map<string, Promise<Browser>>();

  constructor(
    private readonly launchBrowser: SuiteBrowserLauncher = launchVisualQaBrowser,
  ) {}

  async acquire(
    channel: "chrome" | "chromium" | "msedge" | undefined,
  ): Promise<Browser> {
    const key = channel ?? "chrome";
    let browser = this.browsers.get(key);
    if (!browser) {
      browser = this.launchBrowser(key);
      this.browsers.set(key, browser);
    }
    try {
      return await browser;
    } catch (error) {
      this.browsers.delete(key);
      throw error;
    }
  }

  async close(): Promise<void> {
    const browsers = await Promise.allSettled(this.browsers.values());
    this.browsers.clear();
    await Promise.all(
      browsers.flatMap(result =>
        result.status === "fulfilled"
          ? [result.value.close().catch(() => undefined)]
          : [],
      ),
    );
  }
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalBoolean(
  value: unknown,
  name: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function positiveInteger(
  value: unknown,
  name: string,
  fallback?: number,
): number {
  const resolved = value ?? fallback;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved <= 0
  ) {
    throw new Error(`${name} must be a positive integer`);
  }
  return resolved;
}

function normalizeSettings(
  value: unknown,
  name: string,
  baseDirectory: string,
): SuiteVerificationSettings {
  if (value === undefined) return {};
  const input = requireObject(value, name);
  const allowed = new Set([
    "pageReady",
    "mode",
    "reuseVerification",
    "browserEndpoint",
    "changedOnly",
    "topRegions",
    "reuseDesign",
    "noAiOnPass",
    "projectRoot",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${name}.${key} is not supported`);
  }
  const mode = input.mode;
  if (
    mode !== undefined &&
    mode !== "quick" &&
    mode !== "agent" &&
    mode !== "final" &&
    mode !== "adaptive"
  ) {
    throw new Error(`${name}.mode must be quick, agent, final, or adaptive`);
  }
  const browserEndpoint = input.browserEndpoint;
  if (
    browserEndpoint !== undefined &&
    (typeof browserEndpoint !== "string" || !browserEndpoint.trim())
  ) {
    throw new Error(`${name}.browserEndpoint must be a non-empty string`);
  }
  const projectRoot = input.projectRoot;
  if (
    projectRoot !== undefined &&
    (typeof projectRoot !== "string" || !projectRoot.trim())
  ) {
    throw new Error(`${name}.projectRoot must be a non-empty string`);
  }
  return {
    ...(mode ? { mode } : {}),
    ...(browserEndpoint
      ? { browserEndpoint: browserEndpoint.trim() }
      : {}),
    ...(projectRoot
      ? { projectRoot: path.resolve(baseDirectory, projectRoot.trim()) }
      : {}),
    ...(input.topRegions !== undefined
      ? { topRegions: positiveInteger(input.topRegions, `${name}.topRegions`) }
      : {}),
    ...Object.fromEntries(
      [
        "pageReady",
        "reuseVerification",
        "changedOnly",
        "reuseDesign",
        "noAiOnPass",
      ].flatMap((key) => {
        const normalized = optionalBoolean(input[key], `${name}.${key}`);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
    ) as SuiteVerificationSettings,
  };
}

export async function readVisualSuite(suitePath: string): Promise<VisualSuite> {
  const sourcePath = path.resolve(suitePath);
  const baseDirectory = path.dirname(sourcePath);
  const input = requireObject(
    JSON.parse(await fs.readFile(sourcePath, "utf8")) as unknown,
    "suite",
  );
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new Error("suite.schemaVersion must be 1");
  }
  const name = requireText(input.name, "suite.name");
  if (!Array.isArray(input.cases) || input.cases.length === 0) {
    throw new Error("suite.cases must contain at least one case");
  }
  const concurrency = positiveInteger(input.concurrency, "suite.concurrency", 1);
  if (concurrency > 8) throw new Error("suite.concurrency must not exceed 8");
  const failFast = optionalBoolean(input.failFast, "suite.failFast") ?? false;
  const defaults = normalizeSettings(input.defaults, "suite.defaults", baseDirectory);
  const cases = input.cases.map((entry, index): VisualSuiteCase => {
    if (typeof entry === "string") {
      return {
        casePath: path.resolve(baseDirectory, requireText(entry, `suite.cases[${index}]`)),
        options: {},
      };
    }
    const item = requireObject(entry, `suite.cases[${index}]`);
    for (const key of Object.keys(item)) {
      if (!new Set(["case", "label", "options"]).has(key)) {
        throw new Error(`suite.cases[${index}].${key} is not supported`);
      }
    }
    const label = item.label;
    if (label !== undefined && (typeof label !== "string" || !label.trim())) {
      throw new Error(`suite.cases[${index}].label must be a non-empty string`);
    }
    return {
      casePath: path.resolve(
        baseDirectory,
        requireText(item.case, `suite.cases[${index}].case`),
      ),
      ...(typeof label === "string" ? { label: label.trim() } : {}),
      options: normalizeSettings(
        item.options,
        `suite.cases[${index}].options`,
        baseDirectory,
      ),
    };
  });
  return {
    schemaVersion: 1,
    name,
    sourcePath,
    outputDir: path.resolve(
      baseDirectory,
      typeof input.outputDir === "string" && input.outputDir.trim()
        ? input.outputDir
        : `artifacts/${name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`,
    ),
    concurrency,
    failFast,
    defaults,
    cases,
  };
}

async function defaultCaseRunner(
  casePath: string,
  options: SuiteVerificationSettings,
  browserPool: SuiteBrowserPool,
): Promise<VerificationReport | HarmonyReport> {
  const visualCase = await readVisualCase(casePath);
  const browser =
    visualCase.platform !== "harmony" && !options.browserEndpoint
      ? await browserPool.acquire(visualCase.browserChannel)
      : undefined;
  return verifyVisualCase(visualCase, {
    ...options,
    ...(browser ? { browser } : {}),
    cachePath: path.join(visualCase.outputDir!, "cache.json"),
  });
}

function mergeDefined(
  ...settings: Array<SuiteVerificationSettings | undefined>
): SuiteVerificationSettings {
  const result: SuiteVerificationSettings = {};
  for (const setting of settings) {
    if (!setting) continue;
    for (const [key, value] of Object.entries(setting)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

function reportMessage(report: VerificationReport | HarmonyReport): string | undefined {
  if (report.status === "passed") return undefined;
  if ("failure" in report && report.failure) return report.failure.message;
  const mismatch = report.comparison?.mismatchPercent;
  return typeof mismatch === "number"
    ? `Visual mismatch ${mismatch.toFixed(4)}%`
    : "Visual verification failed";
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function suiteReportToJunit(report: SuiteReport): string {
  const seconds = (report.timings.totalMs / 1_000).toFixed(3);
  const cases = report.cases.map((result) => {
    const attributes = `name="${xmlEscape(result.name)}" classname="visual-qa" time="${(
      result.durationMs / 1_000
    ).toFixed(3)}"`;
    if (result.status === "passed") return `  <testcase ${attributes}/>`;
    if (result.status === "skipped") {
      return `  <testcase ${attributes}><skipped message="${xmlEscape(
        result.message ?? "Skipped",
      )}"/></testcase>`;
    }
    const tag = result.status === "error" ? "error" : "failure";
    const message = xmlEscape(result.message ?? "Visual verification failed");
    const details = xmlEscape(
      [result.casePath, result.reportPath].filter(Boolean).join("\n"),
    );
    return `  <testcase ${attributes}><${tag} message="${message}">${details}</${tag}></testcase>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${xmlEscape(report.name)}" tests="${report.summary.total}" failures="${report.summary.failed}" errors="${report.summary.errors}" skipped="${report.summary.skipped}" time="${seconds}">`,
    ...cases,
    "</testsuite>",
    "",
  ].join("\n");
}

function relativeArtifactHref(htmlPath: string, artifactPath: string): string {
  return path
    .relative(path.dirname(htmlPath), artifactPath)
    .split(path.sep)
    .map((part) => (part === ".." || part === "." ? part : encodeURIComponent(part)))
    .join("/");
}

function artifactLinks(result: SuiteCaseResult, htmlPath: string): string {
  if (!result.artifacts) return "";
  const entries: Array<[string, string | undefined]> = [
    ["Report", result.artifacts.report],
    ["Design", result.artifacts.design],
    ["Actual", result.artifacts.actual],
    ["Diff", result.artifacts.diff],
  ];
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(
      ([label, artifactPath]) =>
        `<a href="${xmlEscape(relativeArtifactHref(htmlPath, artifactPath))}">${label}</a>`,
    )
    .join(" · ");
}

export function suiteReportToHtml(report: SuiteReport): string {
  const rows = report.cases.map((result) => {
    const metric = result.mismatchPercent === undefined
      ? "—"
      : `${result.mismatchPercent.toFixed(4)}%`;
    const ssim = result.ssim === undefined || result.ssim === null
      ? "—"
      : result.ssim.toFixed(5);
    return `<tr>
      <td><span class="badge ${result.status}">${xmlEscape(result.status)}</span></td>
      <td><strong>${xmlEscape(result.name)}</strong><small>${xmlEscape(result.casePath)}</small></td>
      <td>${xmlEscape(result.platform ?? "—")}</td>
      <td>${metric}</td>
      <td>${ssim}</td>
      <td>${(result.durationMs / 1_000).toFixed(2)}s</td>
      <td>${artifactLinks(result, report.artifacts.html)}</td>
      <td>${xmlEscape(result.message ?? "")}</td>
    </tr>`;
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${xmlEscape(report.name)} · Visual QA</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f5f7fa; color: #172033; }
    main { max-width: 1180px; margin: 0 auto; padding: 40px 24px 64px; }
    h1 { margin: 0 0 6px; font-size: 30px; }
    .meta { color: #687386; margin-bottom: 28px; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(100px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #dfe4ea; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(23,32,51,.05); }
    .card b { display: block; font-size: 26px; margin-top: 4px; }
    .table { overflow-x: auto; background: #fff; border: 1px solid #dfe4ea; border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; min-width: 940px; }
    th, td { padding: 13px 14px; text-align: left; border-bottom: 1px solid #edf0f3; vertical-align: top; }
    th { color: #5d6879; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    small { display: block; color: #7b8494; margin-top: 4px; max-width: 360px; overflow-wrap: anywhere; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge.passed { color: #087443; background: #dcfce7; }
    .badge.failed, .badge.error { color: #b42318; background: #fee4e2; }
    .badge.skipped { color: #7a5d00; background: #fef0c7; }
    @media (prefers-color-scheme: dark) {
      body { background: #10141d; color: #eef2f7; }
      .card, .table { background: #171d28; border-color: #2a3443; }
      th, td { border-color: #2a3443; }
      .meta, small, th { color: #9da8b8; }
      a { color: #82aaff; }
    }
    @media (max-width: 720px) { .summary { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
<main>
  <h1>${xmlEscape(report.name)}</h1>
  <div class="meta">${xmlEscape(report.generatedAt)} · ${(report.timings.totalMs / 1_000).toFixed(2)}s · ${xmlEscape(report.status)}</div>
  <section class="summary">
    <div class="card">Total<b>${report.summary.total}</b></div>
    <div class="card">Passed<b>${report.summary.passed}</b></div>
    <div class="card">Failed<b>${report.summary.failed}</b></div>
    <div class="card">Errors<b>${report.summary.errors}</b></div>
    <div class="card">Skipped<b>${report.summary.skipped}</b></div>
  </section>
  <div class="table"><table>
    <thead><tr><th>Status</th><th>Case</th><th>Platform</th><th>Mismatch</th><th>SSIM</th><th>Time</th><th>Artifacts</th><th>Message</th></tr></thead>
    <tbody>${rows.join("\n")}</tbody>
  </table></div>
</main>
</body>
</html>
`;
}

export async function runVisualSuite(
  suitePath: string,
  options: RunSuiteOptions = {},
): Promise<SuiteReport> {
  const started = Date.now();
  const suite = await readVisualSuite(suitePath);
  const concurrency = positiveInteger(
    options.concurrency,
    "--concurrency",
    suite.concurrency,
  );
  if (concurrency > 8) throw new Error("--concurrency must not exceed 8");
  const failFast = options.failFast ?? suite.failFast;
  const reportPath = path.resolve(
    options.reportPath ?? path.join(suite.outputDir, "suite-report.json"),
  );
  const junitPath = path.resolve(
    options.junitPath ?? path.join(suite.outputDir, "junit.xml"),
  );
  const htmlPath = path.resolve(
    options.htmlPath ?? path.join(suite.outputDir, "index.html"),
  );
  const browserPool = new SuiteBrowserPool();
  const runCase =
    options.runCase ??
    ((casePath, verification) =>
      defaultCaseRunner(casePath, verification, browserPool));
  const results: Array<SuiteCaseResult | undefined> = new Array(suite.cases.length);
  let cursor = 0;
  let stopScheduling = false;

  const worker = async () => {
    while (true) {
      if (stopScheduling) return;
      const index = cursor;
      cursor += 1;
      if (index >= suite.cases.length) return;
      const entry = suite.cases[index]!;
      const caseStarted = Date.now();
      try {
        const report = await runCase(
          entry.casePath,
          mergeDefined(suite.defaults, entry.options, options.verification),
        );
        const result: SuiteCaseResult = {
          index,
          casePath: entry.casePath,
          name: entry.label ?? report.name,
          platform: "platform" in report ? "harmony" : "web",
          status: report.status,
          durationMs: Date.now() - caseStarted,
          reportPath: report.artifacts.report,
          artifacts: {
            report: report.artifacts.report,
            design: report.artifacts.design,
            ...(report.artifacts.actual ? { actual: report.artifacts.actual } : {}),
            ...(report.artifacts.diff ? { diff: report.artifacts.diff } : {}),
            ...(report.artifacts.diagnosticCrops
              ? { diagnosticCrops: report.artifacts.diagnosticCrops }
              : {}),
          },
          ...(typeof report.comparison?.mismatchPercent === "number"
            ? { mismatchPercent: report.comparison.mismatchPercent }
            : {}),
          ...(report.comparison
            ? { ssim: report.comparison.ssim }
            : {}),
          ...(reportMessage(report) ? { message: reportMessage(report) } : {}),
        };
        results[index] = result;
        if (failFast && result.status !== "passed") stopScheduling = true;
      } catch (error) {
        results[index] = {
          index,
          casePath: entry.casePath,
          name: entry.label ?? path.basename(entry.casePath),
          status: "error",
          durationMs: Date.now() - caseStarted,
          message: error instanceof Error ? error.message : String(error),
        };
        if (failFast) stopScheduling = true;
      }
    }
  };

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, suite.cases.length) },
        () => worker(),
      ),
    );
  } finally {
    await browserPool.close();
  }
  for (let index = 0; index < results.length; index += 1) {
    if (results[index]) continue;
    const entry = suite.cases[index]!;
    results[index] = {
      index,
      casePath: entry.casePath,
      name: entry.label ?? path.basename(entry.casePath),
      status: "skipped",
      durationMs: 0,
      message: "Skipped after fail-fast stopped the suite",
    };
  }
  const ordered = results as SuiteCaseResult[];
  const summary = {
    total: ordered.length,
    passed: ordered.filter((result) => result.status === "passed").length,
    failed: ordered.filter((result) => result.status === "failed").length,
    errors: ordered.filter((result) => result.status === "error").length,
    skipped: ordered.filter((result) => result.status === "skipped").length,
  };
  const report: SuiteReport = {
    schemaVersion: 1,
    kind: "visual-qa-suite-report",
    name: suite.name,
    generatedAt: new Date().toISOString(),
    status: summary.passed === summary.total ? "passed" : "failed",
    sourcePath: suite.sourcePath,
    summary,
    cases: ordered,
    artifacts: { report: reportPath, junit: junitPath, html: htmlPath },
    timings: { totalMs: Date.now() - started },
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(junitPath), { recursive: true });
  await fs.mkdir(path.dirname(htmlPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(junitPath, suiteReportToJunit(report), "utf8");
  await fs.writeFile(htmlPath, suiteReportToHtml(report), "utf8");
  return report;
}

#!/usr/bin/env node
import { createHdcRunner, detectHarmonyDevices } from "./platforms/harmony/device.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { writeAgentContext } from "./agent-context.js";
import { writeGenerationContext } from "./generation-context.js";
import { planDesignBatch, type DesignReadState } from "./design-batch.js";
import { generationTiming } from "./generation-timing.js";
import { writeScaffold } from "./generate-scaffold.js";
import { randomUUID } from "node:crypto";
import { captureH5Screenshot } from "./capture.js";
import { compareScreenshots } from "./compare.js";
import { normalizeVisualCase, readVisualCase } from "./config.js";
import { runDoctor } from "./doctor.js";
import {
  readIntentPlan,
  writeExportManifest,
} from "./export-manifest.js";
import { writeIntentPlan } from "./intent-plan.js";
import type {
  ExportManifestAsset,
  IntentImageItemInput,
  IntentRegionHint,
  RectangleBounds,
} from "./types.js";
import { verifyVisualCase } from "./verify.js";
import { measureVisualCase } from "./measure-case.js";
import { summarizeMeasurement } from "./measure.js";
import { runVisualSuite } from "./suite.js";
import { runCssVariants } from "./variants.js";

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value?.startsWith("--")) continue;
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(value.slice(2), "true");
      continue;
    }
    flags.set(value.slice(2), next);
    index += 1;
  }
  return flags;
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function numberFlag(flags: Map<string, string>, name: string): number {
  const value = Number(required(flags, name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return value;
}

function integerFlag(flags: Map<string, string>, name: string): number {
  const value = numberFlag(flags, name);
  if (!Number.isInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
}

function verificationMode(
  value: string | undefined,
): "quick" | "agent" | "final" | "adaptive" {
  const mode = value ?? "final";
  if (
    mode === "quick" ||
    mode === "agent" ||
    mode === "final" ||
    mode === "adaptive"
  ) return mode;
  throw new Error("--mode must be quick, agent, final, or adaptive");
}

function browserChannel(
  value: string | undefined,
): "chromium" | "chrome" | "msedge" {
  const channel = value ?? "chrome";
  if (channel === "chromium" || channel === "chrome" || channel === "msedge") {
    return channel;
  }
  throw new Error("--browser-channel must be chromium, chrome, or msedge");
}

function compactResult(command: string, result: any): Record<string, unknown> {
  if (command === "variants") return {
    status: result.status, best: result.best, scope: result.scope,
    ranking: result.ranking.map(({ name, eligible, mismatchPercent, improvementPercentagePoints }: any) =>
      ({ name, eligible, mismatchPercent, improvementPercentagePoints })),
    artifacts: result.artifacts, timings: result.timings,
  };
  if (command === "doctor") {
    return {
      status: result.status,
      platform: result.platform,
      failed: result.checks?.filter((check: any) => check.status === "failed"),
      warnings: result.checks?.filter((check: any) => check.status === "warning"),
    };
  }
  if (command === "suite") {
    return {
      status: result.status,
      name: result.name,
      summary: result.summary,
      artifacts: result.artifacts,
      timings: result.timings,
    };
  }
  if (result.platform === "harmony") return nativeResult(result);
  if (command === "verify") {
    return {
      status: result.status,
      name: result.name,
      mismatchPercent: result.comparison?.mismatchPercent,
      ssim: result.comparison?.ssim,
      differenceRegions: result.comparison?.differenceRegions?.map(({ domCandidates, ...region }: any) => region),
      regionIteration: result.comparison?.regionIteration,
      criticalRegions: result.comparison?.criticalRegions,
      changedOnly: result.changedOnly,
      designReused: result.cache?.designReused,
      verificationReused: result.cache?.verificationReused,
      codeVersion: result.cache?.codeVersion,
      ai: result.ai,
      timings: result.timings,
    };
  }
  if (command === "compare") {
    return {
      passed: result.passed,
      mismatchPercent: result.mismatchPercent,
      ssim: result.ssim,
      differenceRegions: result.differenceRegions,
      timings: result.timings,
    };
  }
  if (command === "capture") {
    return {
      url: result.url,
      outputPath: result.outputPath,
      imagesFailed: result.readiness?.imagesFailed,
      consoleErrors: result.consoleErrors,
      cssRulesPassed: result.cssRules?.passed,
      timings: result.timings,
    };
  }
  if (command === "intent-plan") {
    return {
      status: result.status,
      regions: result.regions?.length ?? 0,
      ambiguities: result.ambiguities,
    };
  }
  return {
    status: result.status,
    exports: result.exports?.length ?? 0,
    reusedAssets: result.reusedAssets?.length ?? 0,
    ambiguities: result.ambiguities,
  };
}

function nativeResult(result: any): Record<string, unknown> {
  return { platform: result.platform, scope: result.scope, status: result.status, name: result.name, mode: result.mode,
    source: result.capture?.source, device: result.capture?.device, navigation: result.capture?.navigation,
    checks: result.checks, failure: result.failure, mismatchPercent: result.comparison?.mismatchPercent,
    ssim: result.comparison?.ssim, imageReview: result.ai?.shouldAnalyze, artifacts: result.artifacts, cache: result.cache };
}
function agentResult(result: any): Record<string, unknown> {
  if (result.platform === "harmony") return nativeResult(result);
  return {
    status: result.status,
    name: result.name,
    mode: result.mode,
    workflow: result.workflow,
    measurement: summarizeMeasurement(result.capture?.measurement),
    imageReview: result.ai?.shouldAnalyze,
    mismatchPercent: result.comparison?.mismatchPercent,
    ...(typeof result.comparison?.ssim === "number"
      ? { ssim: result.comparison.ssim }
      : {}),
    differenceRegionCount: result.comparison?.differenceRegions?.length ?? 0,
    regionIteration: result.comparison?.regionIteration,
    criticalRegions: result.comparison?.criticalRegions,
    domCandidates: result.comparison?.differenceRegions?.map((region: any) => ({
      x: region.x, y: region.y, width: region.width, height: region.height,
      candidates: region.domCandidates?.map((candidate: any) => ({ selector: candidate.selector,
        parent: candidate.parent?.selector, overlap: candidate.overlap })),
    })),
    domDiagnosticsWarning: result.comparison?.domDiagnosticsWarning,
    ...(result.workflow?.phase === "iteration"
      ? { differenceRegions: result.comparison?.differenceRegions?.map(({ domCandidates, ...region }: any) => region) }
      : {}),
    css: result.capture?.cssRules?.counts,
    diagnosticCrops: result.artifacts?.diagnosticCrops,
    report: result.artifacts?.report,
    html: result.artifacts?.html,
    cacheHit: result.cache?.verificationReused,
    timings: result.timings,
  };
}

function printResult(
  command: string,
  result: any,
  flags: Map<string, string>,
): void {
  const passed = result.passed === true || result.status === "passed" || result.status === "ready";
  if (flags.has("quiet") && passed) {
    const mismatch = result.comparison?.mismatchPercent ?? result.mismatchPercent;
    const ssim = result.comparison?.ssim ?? result.ssim;
    const metrics =
      typeof mismatch === "number" && typeof ssim === "number"
        ? ` mismatch=${mismatch.toFixed(4)}% ssim=${ssim.toFixed(5)}`
        : "";
    console.log(`PASS ${result.name ?? command}${metrics}${result.platform === "harmony" ? " scope=native-screenshot-visual-only" : ""}`);
    return;
  }
  if (
    command === "verify" &&
    (result.mode === "quick" ||
      result.mode === "agent" ||
      result.workflow?.requestedMode === "adaptive")
  ) {
    console.log(JSON.stringify(agentResult(result)));
    return;
  }
  console.log(
    JSON.stringify(
      flags.has("compact") ? compactResult(command, result) : result,
      null,
      2,
    ),
  );
}

function rectangleFlag(
  flags: Map<string, string>,
  name: string,
): RectangleBounds | undefined {
  const value = flags.get(name);
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[2]! <= 0 ||
    parts[3]! <= 0
  ) {
    throw new Error(`--${name} must be x,y,width,height`);
  }
  return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
}

function nodeIdFromDesignUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).searchParams.get("item-id") ?? undefined;
  } catch {
    throw new Error("--design-url must be a valid URL");
  }
}

interface IntentConfig {
  items: IntentImageItemInput[];
  hints: IntentRegionHint[];
}

async function readIntentConfig(hintsPath: string | undefined): Promise<IntentConfig> {
  if (!hintsPath) return { items: [], hints: [] };
  const input = JSON.parse(
    await fs.readFile(path.resolve(hintsPath), "utf8"),
  ) as IntentRegionHint[] | {
    items?: IntentImageItemInput[];
    hints?: IntentRegionHint[];
  };
  if (Array.isArray(input)) return { items: [], hints: input };
  const items = input.items ?? [];
  const hints = input.hints ?? [];
  if (!Array.isArray(items) || !Array.isArray(hints)) {
    throw new Error("intent config items and hints must both be arrays");
  }
  return { items, hints };
}

function optionalViewport(flags: Map<string, string>) {
  const hasWidth = flags.has("width");
  const hasHeight = flags.has("height");
  if (hasWidth !== hasHeight) throw new Error("--width and --height must be provided together");
  return hasWidth
    ? { width: numberFlag(flags, "width"), height: numberFlag(flags, "height") }
    : undefined;
}

function imageFormat(
  value: string | undefined,
): ExportManifestAsset["format"] | undefined {
  if (!value) return undefined;
  if (value === "png" || value === "jpeg" || value === "svg" || value === "webp") {
    return value;
  }
  throw new Error("--format must be png, jpeg, svg, or webp");
}

function printHelp(): void {
  console.log(`visual-qa

Usage:
  visual-qa doctor [--case <case.json>] [--browser-channel chrome] [--hdc-path <executable>] [--skip-browser-launch] [--compact]
  visual-qa suite --suite <suite.json> [--mode quick|agent|final|adaptive] [--concurrency 2] [--fail-fast] [--output suite-report.json] [--junit junit.xml] [--html index.html] [--compact] [--quiet]
  visual-qa variants --variants <variants.json> [--concurrency 4] [--compact]
  visual-qa harmony-devices [--hdc-path <executable>]
  visual-qa verify --case <harmony.json> [--page-ready] [--mode quick|agent|final]
  visual-qa measure --case <case.json> [--browser-endpoint ws://...]
  visual-qa capture --url <url> --output <actual.png> --width 375 --height 812 [--browser-channel chrome] [--browser-endpoint ws://...] [--compact] [--quiet]
  visual-qa compare --expected <design.png> --actual <actual.png> --output <diff.png> [--top-regions 3] [--compact] [--quiet]
  visual-qa verify --case <case.json> [--mode quick|agent|final|adaptive] [--browser-endpoint ws://...] [--changed-only|--skip-code-scan] [--top-regions 3] [--reuse-design] [--reuse-verification|--no-cache] [--no-ai-on-pass] [--cache cache.json] [--compact] [--quiet]
  visual-qa browser-server [--browser-channel chrome]
  visual-qa intent-plan --design-url <pixso-url> --output <intent-plan.json> --intent intent.json [--annotated marked.png --width 375 --height 812 --frame x,y,width,height]
  visual-qa export-manifest --plan <intent-plan.json> --output <export-manifest.json> [--assets-dir assets/images] [--format png] [--scale 3] [--reuse-assets] [--cache cache.json] [--compact] [--quiet]
  visual-qa agent-context --case <case.json> --output <agent-context.json> [--plan intent-plan.json] [--manifest export-manifest.json] [--report report.json]
  visual-qa generation-context --plan <intent-plan.json> --nodes <pixso-nodes.json> --output <generation-context.json>
  visual-qa design-batch --plan <intent-plan.json> --revision <design-version> --state <read-state.json> --output <batch.json> [--responses responses.json] [--batch-size 16]
  visual-qa generate-scaffold --context <generation-context.json> --config <scaffold-options.json> --output <new-directory>
  visual-qa generation-timing --log <timing.jsonl> --action <start|end|mark|summary> [--id span-id] [--stage design-read] [--status ok|failed]
  Any work command: --trace-log <timing.jsonl> records its CLI duration, including failures.
`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (!command || command === "help" || flags.has("help")) {
    printHelp();
    return;
  }

  if (command === "generation-timing") {
    const action = required(flags, "action");
    if (!["start", "end", "mark", "summary"].includes(action)) throw new Error("Unknown timing action");
    const status = flags.get("status") ?? "ok";
    if (status !== "ok" && status !== "failed") throw new Error("--status must be ok or failed");
    const result = await generationTiming(required(flags, "log"), action === "summary" ? undefined : {
      kind: action as "start" | "end" | "mark", id: required(flags, "id"),
      ...(action === "start" ? { stage: required(flags, "stage") } : {}),
      ...(action === "end" ? { status } : {}),
    });
    console.log(JSON.stringify(action === "summary" ? result : { status: "recorded", elapsedMs: result.elapsedMs, openSpans: result.openSpans.length }));
    return;
  }

  if (command === "design-batch") {
    const statePath = required(flags, "state");
    const output = required(flags, "output");
    const paths = [statePath, output, required(flags, "plan"), flags.get("responses")].filter((p): p is string => Boolean(p)).map((p) => path.resolve(p));
    if (new Set(paths).size !== paths.length) throw new Error("State, plan, responses and output must be separate files");
    const state: DesignReadState | undefined = await fs.readFile(statePath, "utf8").then(JSON.parse).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    const responses = flags.has("responses") ? JSON.parse(await fs.readFile(required(flags, "responses"), "utf8")) : [];
    if (!Array.isArray(responses)) throw new Error("--responses must contain an array of shallow nodes");
    const result = planDesignBatch(await readIntentPlan(required(flags, "plan")), required(flags, "revision"), state, responses,
      flags.has("batch-size") ? integerFlag(flags, "batch-size") : 16);
    for (const [file, data] of [[output, result], [statePath, result.state]] as const) {
      await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
      await fs.rename(temporary, file);
    }
    console.log(JSON.stringify({ status: result.status, output: path.resolve(output), stats: result.stats, issues: result.issues }));
    if (result.status === "needs-review") process.exitCode = 1;
    return;
  }

  if (command === "generate-scaffold") {
    const result = await writeScaffold(
      JSON.parse(await fs.readFile(required(flags, "context"), "utf8")),
      JSON.parse(await fs.readFile(required(flags, "config"), "utf8")), required(flags, "output"),
    );
    console.log(JSON.stringify(result));
    return;
  }

  if (command === "doctor") {
    const report = await runDoctor({
      ...(flags.has("case") ? { casePath: flags.get("case") } : {}),
      ...(flags.has("browser-channel")
        ? { browserChannel: browserChannel(flags.get("browser-channel")) }
        : {}),
      ...(flags.has("hdc-path") ? { hdcPath: flags.get("hdc-path") } : {}),
      skipBrowserLaunch: flags.has("skip-browser-launch"),
    });
    printResult(command, report, flags);
    process.exitCode = report.status === "ready" ? 0 : 1;
    return;
  }

  if (command === "suite") {
    const verification = {
      ...(flags.has("mode") ? { mode: verificationMode(flags.get("mode")) } : {}),
      ...(flags.has("browser-endpoint")
        ? { browserEndpoint: flags.get("browser-endpoint") }
        : {}),
      ...(flags.has("project-root")
        ? { projectRoot: flags.get("project-root") }
        : {}),
      ...(flags.has("top-regions")
        ? { topRegions: integerFlag(flags, "top-regions") }
        : {}),
      ...(flags.has("page-ready") ? { pageReady: true } : {}),
      ...(flags.has("changed-only") ? { changedOnly: true } : {}),
      ...(flags.has("reuse-design") ? { reuseDesign: true } : {}),
      ...(flags.has("no-ai-on-pass") ? { noAiOnPass: true } : {}),
      ...(flags.has("no-cache")
        ? { reuseVerification: false }
        : flags.has("reuse-verification")
          ? { reuseVerification: true }
          : {}),
    };
    const report = await runVisualSuite(required(flags, "suite"), {
      ...(flags.has("concurrency")
        ? { concurrency: integerFlag(flags, "concurrency") }
        : {}),
      ...(flags.has("fail-fast") ? { failFast: true } : {}),
      ...(flags.has("output") ? { reportPath: flags.get("output") } : {}),
      ...(flags.has("junit") ? { junitPath: flags.get("junit") } : {}),
      ...(flags.has("html") ? { htmlPath: flags.get("html") } : {}),
      verification,
    });
    printResult(command, report, flags);
    process.exitCode = report.status === "passed" ? 0 : 1;
    return;
  }

  if (command === "variants") {
    const result = await runCssVariants(required(flags, "variants"),
      flags.has("concurrency") ? integerFlag(flags, "concurrency") : undefined);
    printResult(command, result, flags);
    process.exitCode = result.status === "passed" ? 0 : 1;
    return;
  }

  if (command === "harmony-devices") {
    const devices = await detectHarmonyDevices(createHdcRunner(flags.get("hdc-path")));
    console.log(JSON.stringify({ platform: "harmony", status: devices.some(d => d.reachable) ? "ready" : "unavailable", devices, computerUse: "checked-by-agent" }, null, 2));
    process.exitCode = devices.some(d => d.reachable) ? 0 : 1;
    return;
  }

  if (command === "browser-server") {
    const channel = browserChannel(flags.get("browser-channel"));
    const server = await chromium.launchServer({
      headless: true,
      ...(channel !== "chromium" ? { channel } : {}),
    });
    console.log(
      JSON.stringify({ status: "ready", browserChannel: channel, endpoint: server.wsEndpoint() }),
    );
    const close = () => void server.close();
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    await new Promise<void>((resolve) => server.once("close", resolve));
    return;
  }

  if (command === "capture") {
    const outputPath = path.resolve(required(flags, "output"));
    const visualCase = normalizeVisualCase(
      {
        name: "capture",
        designImage: outputPath,
        url: required(flags, "url"),
        viewport: {
          width: numberFlag(flags, "width"),
          height: numberFlag(flags, "height"),
          deviceScaleFactor: flags.has("dpr")
            ? numberFlag(flags, "dpr")
            : 1,
        },
        wait: {
          selector: flags.get("wait-for"),
          readyExpression: flags.get("ready-expression"),
        },
        browserChannel: browserChannel(flags.get("browser-channel")),
      },
      path.join(process.cwd(), "capture.json"),
    );
    printResult(
      command,
      await captureH5Screenshot(visualCase, outputPath, {
        ...(flags.has("browser-endpoint")
          ? { browserEndpoint: flags.get("browser-endpoint") }
          : {}),
      }),
      flags,
    );
    return;
  }

  if (command === "compare") {
    const result = await compareScreenshots(
      path.resolve(required(flags, "expected")),
      path.resolve(required(flags, "actual")),
      path.resolve(required(flags, "output")),
      {
        maxMismatchPercent: flags.has("max-mismatch")
          ? numberFlag(flags, "max-mismatch")
          : undefined,
        minSsim: flags.has("min-ssim")
          ? numberFlag(flags, "min-ssim")
          : undefined,
        topRegions: flags.has("top-regions")
          ? integerFlag(flags, "top-regions")
          : undefined,
      },
    );
    printResult(command, result, flags);
    process.exitCode = result.passed ? 0 : 1;
    return;
  }

  if (command === "verify") {
    const visualCase = await readVisualCase(required(flags, "case"));
    const report = await verifyVisualCase(visualCase, {
      mode: verificationMode(flags.get("mode")),
      pageReady: flags.has("page-ready"),
      reuseVerification: flags.has("no-cache") ? false : flags.has("reuse-verification") ? true : undefined,
      changedOnly: flags.has("changed-only"),
      skipCodeScan: flags.has("skip-code-scan"),
      topRegions: flags.has("top-regions")
        ? integerFlag(flags, "top-regions")
        : undefined,
      reuseDesign: flags.has("reuse-design"),
      noAiOnPass: flags.has("no-ai-on-pass"),
      cachePath: flags.get("cache"),
      projectRoot: flags.get("project-root"),
      browserEndpoint: flags.get("browser-endpoint"),
    });
    printResult(command, report, flags);
    process.exitCode = report.status === "passed" ? 0 : 1;
    return;
  }

  if (command === "measure") {
    const result = await measureVisualCase(await readVisualCase(required(flags, "case")), {
      browserEndpoint: flags.get("browser-endpoint"),
    });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === "passed" ? 0 : 1;
    return;
  }

  if (command === "intent-plan") {
    const designUrl = flags.get("design-url");
    const sourceNodeId =
      flags.get("node-id") ?? nodeIdFromDesignUrl(designUrl);
    if (!sourceNodeId) {
      throw new Error("--node-id or a --design-url containing item-id is required");
    }
    const annotatedImage = flags.get("annotated");
    const frameBounds = rectangleFlag(flags, "frame");
    const intentConfig = await readIntentConfig(
      flags.get("intent") ?? flags.get("hints"),
    );
    const viewport = optionalViewport(flags);
    if (annotatedImage && !viewport) {
      throw new Error("--width and --height are required with --annotated");
    }
    const plan = await writeIntentPlan(
      {
        name:
          flags.get("name") ??
          (annotatedImage
            ? path.basename(annotatedImage, path.extname(annotatedImage))
            : `pixso-${sourceNodeId.replace(/[^a-z0-9]+/gi, "-")}`),
        ...(designUrl ? { designUrl } : {}),
        sourceNodeId,
        ...(annotatedImage ? { annotatedImage } : {}),
        ...(flags.has("reference")
          ? { referenceImage: flags.get("reference") }
          : {}),
        ...(viewport ? { viewport } : {}),
        ...(frameBounds ? { frameBounds } : {}),
        items: intentConfig.items,
        hints: intentConfig.hints,
      },
      required(flags, "output"),
    );
    printResult(command, plan, flags);
    if (flags.has("strict") && plan.status !== "ready") process.exitCode = 1;
    return;
  }

  if (command === "export-manifest") {
    const plan = await readIntentPlan(required(flags, "plan"));
    const manifest = await writeExportManifest(
      {
        plan,
        ...(flags.has("assets-dir")
          ? { assetsDir: flags.get("assets-dir") }
          : {}),
        ...(flags.has("format")
          ? { defaultFormat: imageFormat(flags.get("format")) }
          : {}),
        ...(flags.has("scale") ? { scale: numberFlag(flags, "scale") } : {}),
      },
      required(flags, "output"),
      {
        reuseAssets: flags.has("reuse-assets"),
        cachePath: flags.get("cache"),
        baseDirectory: flags.get("project-root"),
      },
    );
    printResult(command, manifest, flags);
    if (flags.has("strict") && manifest.status !== "ready") process.exitCode = 1;
    return;
  }

  if (command === "generation-context") {
    const result = await writeGenerationContext(
      await readIntentPlan(required(flags, "plan")),
      required(flags, "nodes"), required(flags, "output"),
    );
    console.log(JSON.stringify(result));
    if (result.status !== "ready") process.exitCode = 1;
    return;
  }

  if (command === "agent-context") {
    const result = await writeAgentContext({
      casePath: required(flags, "case"),
      outputPath: required(flags, "output"),
      ...(flags.has("plan") ? { planPath: flags.get("plan") } : {}),
      ...(flags.has("manifest")
        ? { manifestPath: flags.get("manifest") }
        : {}),
      ...(flags.has("report") ? { reportPath: flags.get("report") } : {}),
    });
    console.log(JSON.stringify(result));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function tracedMain() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const log = flags.get("trace-log");
  if (!log || !command || command === "generation-timing" || command === "help") return main();
  const id = `${command}-${randomUUID()}`;
  await generationTiming(log, { kind: "start", id, stage: `cli:${command}` });
  let status: "ok" | "failed" = "failed";
  try {
    await main();
    status = process.exitCode ? "failed" : "ok";
  } finally {
    await generationTiming(log, { kind: "end", id, status });
  }
}

tracedMain().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});

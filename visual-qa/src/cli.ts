#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { writeAgentContext } from "./agent-context.js";
import { captureH5Screenshot } from "./capture.js";
import { compareScreenshots } from "./compare.js";
import { normalizeVisualCase, readVisualCase } from "./config.js";
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
): "quick" | "agent" | "final" {
  const mode = value ?? "final";
  if (mode === "quick" || mode === "agent" || mode === "final") return mode;
  throw new Error("--mode must be quick, agent, or final");
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
  if (command === "verify") {
    return {
      status: result.status,
      name: result.name,
      mismatchPercent: result.comparison?.mismatchPercent,
      ssim: result.comparison?.ssim,
      differenceRegions: result.comparison?.differenceRegions,
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

function agentResult(result: any): Record<string, unknown> {
  return {
    status: result.status,
    name: result.name,
    mode: result.mode,
    measurement: summarizeMeasurement(result.capture?.measurement),
    imageReview: result.ai?.shouldAnalyze,
    mismatchPercent: result.comparison?.mismatchPercent,
    ...(typeof result.comparison?.ssim === "number"
      ? { ssim: result.comparison.ssim }
      : {}),
    differenceRegionCount: result.comparison?.differenceRegions?.length ?? 0,
    css: result.capture?.cssRules?.counts,
    diagnosticCrops: result.artifacts?.diagnosticCrops,
    report: result.artifacts?.report,
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
    console.log(`PASS ${result.name ?? command}${metrics}`);
    return;
  }
  if (
    command === "verify" &&
    (result.mode === "quick" || result.mode === "agent")
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
  visual-qa measure --case <case.json> [--browser-endpoint ws://...]
  visual-qa capture --url <url> --output <actual.png> --width 375 --height 812 [--browser-channel chrome] [--browser-endpoint ws://...] [--compact] [--quiet]
  visual-qa compare --expected <design.png> --actual <actual.png> --output <diff.png> [--top-regions 3] [--compact] [--quiet]
  visual-qa verify --case <case.json> [--mode quick|agent|final] [--browser-endpoint ws://...] [--changed-only] [--top-regions 3] [--reuse-design] [--reuse-verification|--no-cache] [--no-ai-on-pass] [--cache cache.json] [--compact] [--quiet]
  visual-qa browser-server [--browser-channel chrome]
  visual-qa intent-plan --design-url <pixso-url> --output <intent-plan.json> --intent intent.json [--annotated marked.png --width 375 --height 812 --frame x,y,width,height]
  visual-qa export-manifest --plan <intent-plan.json> --output <export-manifest.json> [--assets-dir assets/images] [--format png] [--scale 3] [--reuse-assets] [--cache cache.json] [--compact] [--quiet]
  visual-qa agent-context --case <case.json> --output <agent-context.json> [--plan intent-plan.json] [--manifest export-manifest.json] [--report report.json]
`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (!command || command === "help" || flags.has("help")) {
    printHelp();
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
      reuseVerification: flags.has("no-cache") ? false : flags.has("reuse-verification") ? true : undefined,
      changedOnly: flags.has("changed-only"),
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});

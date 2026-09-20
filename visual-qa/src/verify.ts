import { verifyHarmonyCase, type HarmonyReport } from "./platforms/harmony/verify.js";
import type { HarmonyCase, PlatformCase } from "./types.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  changedRegions,
  collectCodeState,
  hashFile,
  hashValue,
  readCache,
  writeCache,
} from "./cache.js";
import { captureH5Screenshot, launchVisualQaBrowser } from "./capture.js";
import { writeVerificationReport } from "./report.js";
import { compareScreenshots, writeComparisonCrops } from "./compare.js";
import { associateDifferenceRegions } from "./region-diagnostics.js";
import { recordRegionHistory } from "./region-history.js";
import { recordMeasurement } from "./measure.js";
import { measurementIdentity } from "./measure-case.js";
import {
  createAdaptiveWorkflow,
  resolveAdaptiveMode,
} from "./adaptive.js";
import type {
  VerificationOptions,
  VerificationReport,
  VisualCase,
} from "./types.js";

export function verifyVisualCase(visualCase: VisualCase, options?: VerificationOptions): Promise<VerificationReport>;
export function verifyVisualCase(visualCase: HarmonyCase, options?: VerificationOptions): Promise<HarmonyReport>;
export function verifyVisualCase(visualCase: PlatformCase, options?: VerificationOptions): Promise<VerificationReport | HarmonyReport>;
export async function verifyVisualCase(visualCase: PlatformCase, options: VerificationOptions = {}): Promise<VerificationReport | HarmonyReport> {
  if (options.skipCodeScan && (options.changedOnly || options.reuseVerification)) {
    throw new Error("--skip-code-scan cannot be combined with --changed-only or --reuse-verification");
  }
  if (options.skipCodeScan && visualCase.platform === "harmony") {
    throw new Error("--skip-code-scan is only supported for Web cases");
  }
  if (options.mode === "adaptive") {
    if (visualCase.platform === "harmony") {
      throw new Error("Adaptive verification is only supported for Web cases");
    }
    return verifyAdaptiveVisualCase(visualCase, options);
  }
  if (visualCase.platform === "harmony") return verifyHarmonyCase(visualCase, options);
  const totalStarted = Date.now();
  const mode = options.mode ?? "final";
  const outputDirectory = path.resolve(visualCase.outputDir!);
  const actualPath = path.join(outputDirectory, "actual.png");
  const diffPath = path.join(outputDirectory, "diff.png");
  const reportPath = path.join(outputDirectory, "report.json");
  await fs.mkdir(outputDirectory, { recursive: true });

  const projectRoot = path.resolve(
    options.projectRoot ??
      visualCase.changeDetection?.projectRoot ??
      process.cwd(),
  );
  const codeStateStarted = Date.now();
  const code =
    options.skipCodeScan
      ? { revision: "not-scanned", version: "not-scanned", changedFiles: [] }
      :
    options.preparedCodeState ??
    await collectCodeState(
      projectRoot,
      visualCase.changeDetection?.baseRef ?? "HEAD",
    );
  const codeStateMs = Date.now() - codeStateStarted;
  const selectedRegions =
    options.changedOnly && visualCase.changeDetection
      ? changedRegions(code.changedFiles, visualCase.changeDetection.regions)
      : [];
  const changedOnly = options.changedOnly
    ? {
        requested: true,
        applied: selectedRegions.length > 0,
        changedFiles: code.changedFiles,
        regions: selectedRegions.map((region) => region.name),
        ...(visualCase.changeDetection
          ? selectedRegions.length === 0
            ? { reason: "No changed source file matched a configured region; compared the full page" }
            : {}
          : {
              reason:
                "The case has no changeDetection mapping; compared the full page",
            }),
      }
    : undefined;

  const cacheStarted = Date.now();
  const cachePath = path.resolve(
    options.cachePath ?? path.join(projectRoot, "cache.json"),
  );
  const cache = await readCache(cachePath);
  const designHash =
    options.preparedDesignHash ?? await hashFile(visualCase.designImage);
  const caseHash = hashValue({
    diagnosticsVersion: 1,
    visualCase,
    mode,
    changedOnly: options.changedOnly ?? false,
    topRegions: options.topRegions ?? null,
  });
  const designKey = visualCase.pixsoNodeId ?? visualCase.designImage;
  const cachedDesign = cache.designs[designKey];
  const designReused = Boolean(
    options.reuseDesign &&
      cachedDesign &&
      cachedDesign.hash === designHash &&
      cachedDesign.nodeVersion === visualCase.pixsoNodeVersion,
  );
  const cachedVerification = cache.verifications[visualCase.name];
  const mayReuseVerification =
    !options.skipCodeScan &&
    (options.reuseVerification ?? (!visualCase.contract && (mode === "quick" || mode === "agent")));
  let cacheLookupMs = Date.now() - cacheStarted;
  if (
    mayReuseVerification &&
    cachedVerification?.designHash === designHash &&
    cachedVerification.codeVersion === code.version &&
    cachedVerification.caseHash === caseHash &&
    cachedVerification.mode === mode
  ) {
    try {
      const cachedReport = JSON.parse(
        await fs.readFile(cachedVerification.report, "utf8"),
      ) as VerificationReport;
      cacheLookupMs = Date.now() - cacheStarted;
      return {
        ...cachedReport,
        cache: {
          ...cachedReport.cache,
          verificationReused: true,
        },
        timings: {
          codeStateMs,
          cacheLookupMs,
          captureMs: 0,
          comparisonMs: 0,
          domDiagnosticsMs: 0,
          regionHistoryMs: 0,
          diagnosticCropsMs: 0,
          persistMs: 0,
          totalMs: Date.now() - totalStarted,
        },
      };
    } catch {
      // A missing or invalid report is a normal cache miss.
    }
  }
  cacheLookupMs = Date.now() - cacheStarted;

  const captureCase: VisualCase =
    mode === "quick"
      ? {
          ...visualCase,
          wait: {
            ...visualCase.wait,
            networkIdle: false,
            stableFrames: 1,
            timeoutMs: Math.min(visualCase.wait?.timeoutMs ?? 5_000, 5_000),
          },
          structure: undefined,
          cssRules: undefined,
        }
      : visualCase;
  let comparison!: import("./types.js").ComparisonResult;
  let comparisonMs = 0;
  let domDiagnosticsMs = 0;
  const captureStarted = Date.now();
  const capture = await captureH5Screenshot(captureCase, actualPath, {
    afterScreenshot: async (page) => {
      const comparisonStarted = Date.now();
      comparison = await compareScreenshots(
        visualCase.designImage,
        actualPath,
        diffPath,
        {
          ...visualCase.thresholds,
          criticalRegions: visualCase.criticalRegions,
          topRegions: options.topRegions ?? (mode === "agent" ? 2 : 3),
          computeSsim: mode !== "quick",
          analyzeDifferenceRegions: true,
          differenceRegionsOnFailureOnly: mode !== "final",
          ...(selectedRegions.length > 0
            ? { includeRegions: selectedRegions.map((region) => region.bounds) }
            : {}),
        },
      );
      comparisonMs = Date.now() - comparisonStarted;
      const domStarted = Date.now();
      comparison.domDiagnosticsWarning = await associateDifferenceRegions(page, comparison.differenceRegions, visualCase.fullPage ?? false)
        .catch(error => `DOM candidates unavailable: ${String(error)}`);
      domDiagnosticsMs = Date.now() - domStarted;
    },
    ...(options.browser ? { browser: options.browser } : {}),
    ...(options.browserEndpoint
      ? { browserEndpoint: options.browserEndpoint }
      : {}),
  });
  const captureMs = Date.now() - captureStarted - comparisonMs - domDiagnosticsMs;
  if (capture.measurement) {
    await recordMeasurement(capture.measurement, path.join(outputDirectory, "measurement-history.json"), measurementIdentity(visualCase));
  }
  const passed =
    comparison.passed &&
    (!capture.measurement || !capture.measurement.failOnMismatch || capture.measurement.passed) &&
    capture.readiness.fontsReady &&
    capture.readiness.imagesFailed.length === 0 &&
    capture.readiness.layoutStable &&
    capture.consoleErrors.length === 0 &&
    (!capture.structure ||
      !capture.structure.failOnMismatch ||
      capture.structure.passed) &&
    (!capture.cssRules ||
      !capture.cssRules.failOnMismatch ||
      capture.cssRules.passed);

  const historyStarted = Date.now();
  comparison.regionIteration = await recordRegionHistory(
    diffPath, comparison.differenceRegions, path.join(outputDirectory, "region-history.json"),
    hashValue({ designHash, ...measurementIdentity(visualCase), fullPage: visualCase.fullPage ?? false,
      thresholds: comparison.thresholds, criticalRegions: visualCase.criticalRegions, comparedRegions: comparison.comparedRegions ?? null }),
    !(options.deferPassedRegionHistory && passed),
  );

  const regionHistoryMs = Date.now() - historyStarted;
  const diagnosticCropsStarted = Date.now();
  const shouldReviewImages = mode !== "quick" && !comparison.passed &&
    (!capture.measurement || capture.measurement.passed || Boolean(capture.measurement.iteration?.recommendImageReview));
  const diagnosticCrops =
    mode === "agent" && shouldReviewImages && comparison.differenceRegions.length > 0
      ? await writeComparisonCrops(
          visualCase.designImage,
          actualPath,
          comparison.differenceRegions,
          path.join(outputDirectory, "diagnostics"),
        )
      : [];
  const diagnosticCropsMs = Date.now() - diagnosticCropsStarted;

  const report: VerificationReport = {
    schemaVersion: 1,
    name: visualCase.name,
    ...(visualCase.pixsoNodeId
      ? { pixsoNodeId: visualCase.pixsoNodeId }
      : {}),
    generatedAt: new Date().toISOString(),
    status: passed ? "passed" : "failed",
    mode,
    capture,
    comparison,
    ...(changedOnly ? { changedOnly } : {}),
    cache: {
      path: cachePath,
      designReused,
      verificationReused: false,
      designHash,
      codeVersion: code.version,
    },
    ai: {
      shouldAnalyze: shouldReviewImages,
      skipped: !shouldReviewImages,
      reason:
        mode === "quick"
          ? "Quick mode performs local iteration without image understanding"
          : (options.noAiOnPass || mode === "agent") && passed
          ? "Local visual validation passed; image understanding is not needed"
          : passed
            ? "Local visual validation passed"
            : shouldReviewImages
              ? "Inspect the reported difference regions"
              : "Resolve the reported measurement or local validation failures first",
      ...(diagnosticCrops.length > 0
        ? {
            diagnosticCrops,
            cropLayout: "expected-left-actual-right" as const,
          }
        : {}),
    },
    artifacts: {
      design: visualCase.designImage,
      actual: actualPath,
      diff: diffPath,
      report: reportPath,
      ...(diagnosticCrops.length > 0 ? { diagnosticCrops } : {}),
    },
    timings: {
      codeStateMs,
      cacheLookupMs,
      captureMs,
      comparisonMs,
      domDiagnosticsMs,
      regionHistoryMs,
      diagnosticCropsMs,
      persistMs: 0,
      totalMs: Date.now() - totalStarted,
    },
  };
  const persistStarted = Date.now();
  cache.designs[designKey] = {
    ...(visualCase.pixsoNodeId ? { nodeId: visualCase.pixsoNodeId } : {}),
    ...(visualCase.pixsoNodeVersion
      ? { nodeVersion: visualCase.pixsoNodeVersion }
      : {}),
    file: visualCase.designImage,
    hash: designHash,
  };
  cache.code = code;
  cache.verifications[visualCase.name] = {
    status: report.status,
    designHash,
    codeVersion: code.version,
    caseHash,
    mode,
    report: reportPath,
  };
  await writeCache(cachePath, cache);
  report.timings.persistMs = Date.now() - persistStarted;
  report.timings.totalMs = Date.now() - totalStarted;
  await writeVerificationReport(report);
  return report;
}

async function readPreviousVerification(
  reportPath: string,
): Promise<VerificationReport | undefined> {
  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as VerificationReport;
    return report.schemaVersion === 1 ? report : undefined;
  } catch {
    return undefined;
  }
}

async function persistAdaptiveReport(
  report: VerificationReport,
): Promise<VerificationReport> {
  await writeVerificationReport(report);
  return report;
}

async function verifyAdaptiveVisualCase(
  visualCase: VisualCase,
  options: VerificationOptions,
): Promise<VerificationReport> {
  // Share one owned browser across candidate and final; each capture still gets
  // a fresh context and executes its own readiness/structure/CSS checks.
  if (!options.browser && !options.browserEndpoint) {
    const started = Date.now();
    const browser = await launchVisualQaBrowser(visualCase.browserChannel);
    try {
      const report = await runAdaptiveVisualCase(visualCase, { ...options, browser });
      report.timings.totalMs = Date.now() - started;
      return await persistAdaptiveReport(report);
    } finally {
      await browser.close();
    }
  }
  return runAdaptiveVisualCase(visualCase, options);
}

async function runAdaptiveVisualCase(
  visualCase: VisualCase,
  options: VerificationOptions,
): Promise<VerificationReport> {
  const adaptiveStarted = Date.now();
  const reportPath = path.join(path.resolve(visualCase.outputDir!), "report.json");
  const previous = await readPreviousVerification(reportPath);
  const designHash = await hashFile(visualCase.designImage);
  const effectiveMode = resolveAdaptiveMode(previous, designHash);
  const report = await verifyVisualCase(visualCase, {
    ...options,
    mode: effectiveMode,
    deferPassedRegionHistory: true,
    reuseVerification:
      effectiveMode === "quick" && !options.skipCodeScan
        ? options.reuseVerification ?? true
        : false,
    preparedDesignHash: designHash,
  });

  if (report.cache.verificationReused && report.workflow) return report;

  if (report.status === "passed" && report.mode !== "final") {
    const preparedCodeState = (await readCache(report.cache.path)).code;
    const finalReport = await verifyVisualCase(visualCase, {
      ...options,
      mode: "final",
      deferPassedRegionHistory: false,
      reuseVerification: false,
      preparedCodeState,
      preparedDesignHash: designHash,
    });
    const candidateTimings = report.timings;
    finalReport.timings = {
      codeStateMs: candidateTimings.codeStateMs + finalReport.timings.codeStateMs,
      cacheLookupMs: candidateTimings.cacheLookupMs + finalReport.timings.cacheLookupMs,
      captureMs: candidateTimings.captureMs + finalReport.timings.captureMs,
      comparisonMs: candidateTimings.comparisonMs + finalReport.timings.comparisonMs,
      domDiagnosticsMs: (candidateTimings.domDiagnosticsMs ?? 0) + (finalReport.timings.domDiagnosticsMs ?? 0),
      regionHistoryMs: (candidateTimings.regionHistoryMs ?? 0) + (finalReport.timings.regionHistoryMs ?? 0),
      diagnosticCropsMs:
        candidateTimings.diagnosticCropsMs + finalReport.timings.diagnosticCropsMs,
      persistMs: candidateTimings.persistMs + finalReport.timings.persistMs,
      totalMs: Date.now() - adaptiveStarted,
    };
    finalReport.workflow = createAdaptiveWorkflow(previous, finalReport, {
      autoFinalized: true,
      candidateMismatchPercent: report.comparison.mismatchPercent,
    });
    return persistAdaptiveReport(finalReport);
  }

  let workflow = createAdaptiveWorkflow(previous, report);
  const shouldCreateCrops =
    report.mode === "quick" &&
    report.status === "failed" &&
    report.comparison.differenceRegions.length > 0;
  if (shouldCreateCrops) {
    const cropStarted = Date.now();
    const diagnosticCrops = await writeComparisonCrops(
      visualCase.designImage,
      report.artifacts.actual,
      report.comparison.differenceRegions,
      path.join(path.resolve(visualCase.outputDir!), "diagnostics"),
    );
    report.timings.diagnosticCropsMs += Date.now() - cropStarted;
    report.ai = {
      shouldAnalyze: true,
      skipped: false,
      reason: "Pixel comparison failed; inspect the diagnostic crops and batch all local fixes before rerunning",
      diagnosticCrops,
      cropLayout: "expected-left-actual-right",
    };
    report.artifacts.diagnosticCrops = diagnosticCrops;
    workflow = createAdaptiveWorkflow(previous, report, {
      hasDiagnosticCrops: true,
    });
  }
  report.workflow = workflow;
  report.timings.totalMs = Date.now() - adaptiveStarted;
  return persistAdaptiveReport(report);
}

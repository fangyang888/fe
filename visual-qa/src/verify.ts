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
import { captureH5Screenshot } from "./capture.js";
import { compareScreenshots, writeComparisonCrops } from "./compare.js";
import { recordMeasurement } from "./measure.js";
import { measurementIdentity } from "./measure-case.js";
import type {
  VerificationOptions,
  VerificationReport,
  VisualCase,
} from "./types.js";

export async function verifyVisualCase(
  visualCase: VisualCase,
  options: VerificationOptions = {},
): Promise<VerificationReport> {
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
  const code = await collectCodeState(
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
  const designHash = await hashFile(visualCase.designImage);
  const caseHash = hashValue({
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
    options.reuseVerification ?? (!visualCase.contract && (mode === "quick" || mode === "agent"));
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
  const captureStarted = Date.now();
  const capture = await captureH5Screenshot(captureCase, actualPath, {
    ...(options.browser ? { browser: options.browser } : {}),
    ...(options.browserEndpoint
      ? { browserEndpoint: options.browserEndpoint }
      : {}),
  });
  const captureMs = Date.now() - captureStarted;
  if (capture.measurement) {
    await recordMeasurement(capture.measurement, path.join(outputDirectory, "measurement-history.json"), measurementIdentity(visualCase));
  }
  const comparisonStarted = Date.now();
  const comparison = await compareScreenshots(
    visualCase.designImage,
    actualPath,
    diffPath,
    {
      ...visualCase.thresholds,
      topRegions: options.topRegions ?? (mode === "agent" ? 2 : 3),
      computeSsim: mode !== "quick",
      analyzeDifferenceRegions: mode !== "quick",
      differenceRegionsOnFailureOnly: mode === "agent",
      ...(selectedRegions.length > 0
        ? { includeRegions: selectedRegions.map((region) => region.bounds) }
        : {}),
    },
  );
  const comparisonMs = Date.now() - comparisonStarted;
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
      diagnosticCropsMs,
      persistMs: 0,
      totalMs: Date.now() - totalStarted,
    },
  };
  const persistStarted = Date.now();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

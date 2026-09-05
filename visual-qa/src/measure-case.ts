import path from "node:path";
import { promises as fs } from "node:fs";
import { captureH5Screenshot, type CaptureOptions } from "./capture.js";
import { recordMeasurement, summarizeMeasurement } from "./measure.js";
import type { VisualCase } from "./types.js";

export function measurementIdentity(visualCase: VisualCase) {
  return { name: visualCase.name, url: visualCase.url, viewport: visualCase.viewport, contract: visualCase.contract, locale: visualCase.locale, timezoneId: visualCase.timezoneId, browserChannel: visualCase.browserChannel, colorScheme: visualCase.colorScheme };
}

export async function measureVisualCase(visualCase: VisualCase, options: CaptureOptions = {}) {
  if (!visualCase.contract) throw new Error("measure requires case.contract");
  const outputDirectory = path.resolve(visualCase.outputDir!);
  const reportPath = path.join(outputDirectory, "measurement.json");
  const capture = await captureH5Screenshot({ ...visualCase, structure: undefined, cssRules: undefined }, reportPath, { ...options, skipScreenshot: true });
  const result = capture.measurement!;
  await recordMeasurement(result, path.join(outputDirectory, "measurement-history.json"), measurementIdentity(visualCase));
  const failures = [
    ...capture.consoleErrors.map((message) => ({ type: "console", message })),
    ...capture.readiness.imagesFailed.map((message) => ({ type: "image", message })),
    ...(!capture.readiness.fontsReady ? [{ type: "fonts", message: "Fonts not ready" }] : []),
    ...(!capture.readiness.layoutStable ? [{ type: "layout", message: "Layout not stable" }] : []),
  ];
  const status = result.passed && !failures.length ? "passed" : "failed";
  await fs.writeFile(reportPath, JSON.stringify({ status, measurement: result, readiness: capture.readiness, failures, timings: capture.timings }, null, 2), "utf8");
  return { status, name: visualCase.name, measurement: summarizeMeasurement(result), failures: failures.slice(0, 8), omittedFailures: Math.max(0, failures.length - 8), report: reportPath, timings: capture.timings };
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { inspectCssRules } from "./css-rules.js";
import { waitForVisualReadiness } from "./readiness.js";
import { inspectVisualStructure } from "./structure.js";
import type { CaptureResult, VisualCase } from "./types.js";

export interface CaptureOptions {
  browser?: Browser;
  browserEndpoint?: string;
}

export async function launchVisualQaBrowser(
  channel: VisualCase["browserChannel"] = "chrome",
): Promise<Browser> {
  return chromium.launch({
    headless: true,
    ...(channel && channel !== "chromium" ? { channel } : {}),
  });
}

export async function captureH5Screenshot(
  visualCase: VisualCase,
  outputPath: string,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const totalStarted = Date.now();
  const timings: CaptureResult["timings"] = {
    browserMode: options.browser
      ? "shared"
      : options.browserEndpoint
        ? "connected"
        : "launched",
    browserAcquireMs: 0,
    contextSetupMs: 0,
    navigationMs: 0,
    readinessMs: 0,
    structureMs: 0,
    cssRulesMs: 0,
    screenshotMs: 0,
    totalMs: 0,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const viewport = {
    width: visualCase.viewport.width,
    height: visualCase.viewport.height,
    deviceScaleFactor: visualCase.viewport.deviceScaleFactor ?? 1,
  };
  const browserStarted = Date.now();
  const browser =
    options.browser ??
    (options.browserEndpoint
      ? await chromium.connect(options.browserEndpoint)
      : await launchVisualQaBrowser(visualCase.browserChannel));
  timings.browserAcquireMs = Date.now() - browserStarted;
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;

  try {
    const contextStarted = Date.now();
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      locale: visualCase.locale,
      timezoneId: visualCase.timezoneId,
      colorScheme: visualCase.colorScheme,
      reducedMotion: "reduce",
    });
    timings.contextSetupMs = Date.now() - contextStarted;
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const navigationStarted = Date.now();
    await page.goto(visualCase.url, {
      waitUntil: "domcontentloaded",
      timeout: visualCase.wait?.timeoutMs ?? 15_000,
    });
    timings.navigationMs = Date.now() - navigationStarted;
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
      `,
    });
    const readinessStarted = Date.now();
    const readiness = await waitForVisualReadiness(page, visualCase.wait);
    timings.readinessMs = Date.now() - readinessStarted;
    const structureStarted = Date.now();
    const structure = visualCase.structure
      ? await inspectVisualStructure(page, visualCase.structure)
      : undefined;
    timings.structureMs = Date.now() - structureStarted;
    const cssRulesStarted = Date.now();
    const cssRules = visualCase.cssRules
      ? await inspectCssRules(page, visualCase.cssRules as Required<typeof visualCase.cssRules>)
      : undefined;
    timings.cssRulesMs = Date.now() - cssRulesStarted;
    const screenshotStarted = Date.now();
    await page.screenshot({
      path: outputPath,
      fullPage: visualCase.fullPage ?? false,
      animations: "disabled",
    });
    timings.screenshotMs = Date.now() - screenshotStarted;

    return {
      url: page.url(),
      title: await page.title(),
      outputPath,
      viewport,
      readiness,
      timings,
      consoleErrors,
      ...(structure ? { structure } : {}),
      ...(cssRules ? { cssRules } : {}),
    };
  } finally {
    await context?.close().catch(() => undefined);
    if (!options.browser) await browser.close().catch(() => undefined);
    timings.totalMs = Date.now() - totalStarted;
  }
}

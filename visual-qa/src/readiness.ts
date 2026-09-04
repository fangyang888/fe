import type { Page } from "playwright";
import type { WaitConfig } from "./types.js";

interface ReadinessResult {
  fontsReady: boolean;
  imagesTotal: number;
  imagesFailed: string[];
  layoutStable: boolean;
  timings: {
    networkIdleMs: number;
    selectorMs: number;
    readyExpressionMs: number;
    fontsMs: number;
    imagesMs: number;
    layoutMs: number;
    totalMs: number;
    networkIdleSkipped: boolean;
  };
}

async function waitForFonts(page: Page, timeoutMs: number): Promise<boolean> {
  return page.evaluate(async (timeout) => {
    if (!("fonts" in document)) return true;
    return Promise.race([
      document.fonts.ready.then(() => document.fonts.status === "loaded"),
      new Promise<boolean>((resolve) =>
        window.setTimeout(() => resolve(false), timeout),
      ),
    ]);
  }, timeoutMs);
}

async function waitForImages(page: Page, timeoutMs: number): Promise<{
  total: number;
  failed: string[];
}> {
  return page.evaluate(async (timeout) => {
    const images = [...document.images];
    const settle = (image: HTMLImageElement): Promise<boolean> =>
      new Promise((resolve) => {
        if (image.complete) {
          void image.decode().then(() => resolve(true)).catch(() => resolve(false));
          return;
        }
        image.addEventListener("load", () => resolve(true), { once: true });
        image.addEventListener("error", () => resolve(false), { once: true });
      });

    const results = await Promise.all(
      images.map((image) =>
        Promise.race([
          settle(image),
          new Promise<boolean>((resolve) =>
            window.setTimeout(() => resolve(false), timeout),
          ),
        ]),
      ),
    );

    return {
      total: images.length,
      failed: images
        .filter((_, index) => !results[index])
        .map((image) => image.currentSrc || image.src || "<unknown image>"),
    };
  }, timeoutMs);
}

async function waitForStableLayout(
  page: Page,
  frames: number,
  timeoutMs: number,
): Promise<boolean> {
  return page.evaluate(
    async ({ requiredFrames, timeout }) => {
      const startedAt = Date.now();
      let stableCount = 0;
      let previous = "";

      while (Date.now() - startedAt < timeout) {
        const current = JSON.stringify({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          bodyWidth: document.body?.getBoundingClientRect().width ?? 0,
          bodyHeight: document.body?.getBoundingClientRect().height ?? 0,
        });
        stableCount = current === previous ? stableCount + 1 : 0;
        previous = current;
        if (stableCount >= requiredFrames) return true;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return false;
    },
    { requiredFrames: Math.max(1, frames), timeout: timeoutMs },
  );
}

export async function waitForVisualReadiness(
  page: Page,
  config: WaitConfig = {},
): Promise<ReadinessResult> {
  const timeoutMs = config.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const remainingMs = () => Math.max(1, deadline - Date.now());
  const elapsed = (started: number) => Date.now() - started;
  const timings = {
    networkIdleMs: 0,
    selectorMs: 0,
    readyExpressionMs: 0,
    fontsMs: 0,
    imagesMs: 0,
    layoutMs: 0,
    totalMs: 0,
    networkIdleSkipped: config.networkIdle === false || Boolean(config.readyExpression),
  };

  if (!timings.networkIdleSkipped) {
    const phaseStarted = Date.now();
    await page
      .waitForLoadState("networkidle", {
        timeout: Math.min(remainingMs(), 5_000),
      })
      .catch(() => undefined);
    timings.networkIdleMs = elapsed(phaseStarted);
  }
  if (config.selector) {
    const phaseStarted = Date.now();
    await page
      .locator(config.selector)
      .waitFor({ state: "visible", timeout: remainingMs() });
    timings.selectorMs = elapsed(phaseStarted);
  }
  if (config.readyExpression) {
    const phaseStarted = Date.now();
    await page.waitForFunction(config.readyExpression, undefined, {
      timeout: remainingMs(),
    });
    timings.readyExpressionMs = elapsed(phaseStarted);
  }

  const resourceTimeout = remainingMs();
  const fontsStarted = Date.now();
  const imagesStarted = Date.now();
  const [fontsReady, images] = await Promise.all([
    waitForFonts(page, resourceTimeout).finally(() => {
      timings.fontsMs = elapsed(fontsStarted);
    }),
    waitForImages(page, resourceTimeout).finally(() => {
      timings.imagesMs = elapsed(imagesStarted);
    }),
  ]);
  const layoutStarted = Date.now();
  const layoutStable = await waitForStableLayout(
    page,
    config.stableFrames ?? 3,
    remainingMs(),
  );
  timings.layoutMs = elapsed(layoutStarted);
  timings.totalMs = elapsed(startedAt);

  return {
    fontsReady,
    imagesTotal: images.total,
    imagesFailed: images.failed,
    layoutStable,
    timings,
  };
}

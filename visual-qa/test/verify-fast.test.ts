import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";
import { verifyVisualCase } from "../src/verify.js";
import type { VisualCase } from "../src/types.js";

test("skip-code-scan rejects options that require a source identity before browser work", async () => {
  for (const options of [{ changedOnly: true }, { reuseVerification: true }]) {
    await assert.rejects(verifyVisualCase({} as VisualCase, { ...options, skipCodeScan: true }), /cannot be combined/);
  }
});

test("adaptive shares an owned browser, performs two captures, and never reuses unscanned verification", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-fast-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const png = new PNG({ width: 20, height: 20 });
  png.data.fill(255);
  const bytes = PNG.sync.write(png);
  const designImage = path.join(directory, "design.png");
  await fs.writeFile(designImage, bytes);
  let launched = 0, closed = 0, contextsClosed = 0, screenshots = 0;
  const browser = {
    newContext: async () => {
      let evaluation = 0;
      const page = {
        on: () => page, goto: async () => undefined, addStyleTag: async () => undefined,
        evaluate: async () => ++evaluation === 2 ? { total: 0, failed: [] } : true,
        screenshot: async ({ path: destination }: { path: string }) => {
          screenshots++;
          await fs.writeFile(destination, bytes);
        },
        title: async () => "fixture", url: () => "http://localhost/fixture",
      } as unknown as Page;
      return { newPage: async () => page, close: async () => { contextsClosed++; } };
    },
    close: async () => { closed++; },
  } as unknown as Browser;
  t.mock.method(chromium, "launch", async () => { launched++; return browser; });
  const visualCase: VisualCase = {
    name: "fixture", designImage, outputDir: directory,
    url: "http://localhost/fixture", viewport: { width: 20, height: 20 },
    wait: { networkIdle: false, timeoutMs: 200, stableFrames: 1 },
  };
  const options = { mode: "adaptive" as const, skipCodeScan: true, cachePath: path.join(directory, "cache.json") };
  const result = await verifyVisualCase(visualCase, options);
  assert.equal(result.workflow?.nextAction, "complete");
  assert.equal(result.mode, "final");
  assert.equal(result.cache.codeVersion, "not-scanned");
  assert.equal(result.cache.verificationReused, false);
  assert.equal(result.capture.timings.browserMode, "shared");
  assert.equal(launched, 1);
  assert.equal(closed, 1);
  assert.equal(screenshots, 2);
  assert.equal(contextsClosed, 2);
  assert.ok(result.artifacts.html);
  const saved = JSON.parse(await fs.readFile(result.artifacts.report, "utf8"));
  assert.equal(saved.workflow.nextAction, "complete");
  // Caller-owned browsers stay open; unscanned quick mode must capture each time.
  for (let index = 0; index < 2; index++) {
    const quick = await verifyVisualCase(visualCase, { ...options, mode: "quick", browser });
    assert.equal(quick.cache.verificationReused, false);
  }
  assert.equal(screenshots, 4);
  assert.equal(closed, 1);
  t.mock.method(browser, "newContext", async () => { throw new Error("capture failed"); });
  await assert.rejects(verifyVisualCase(visualCase, options), /capture failed/);
  assert.equal(closed, 2);
});

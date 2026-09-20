import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchVisualQaBrowser, captureH5Screenshot } from "../src/capture.js";
import { associateDifferenceRegions } from "../src/region-diagnostics.js";
import { normalizeVisualCase } from "../src/config.js";
import { verifyVisualCase } from "../src/verify.js";
import type { DifferenceRegion } from "../src/types.js";

test("DOM association handles DPR, scroll, hidden ancestors and overlapping candidates", async () => {
  const browser = await launchVisualQaBrowser("chrome");
  try {
    const context = await browser.newContext({ viewport: { width: 300, height: 200 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.setContent(`<style>body{margin:0;height:2000px}main{position:absolute;top:300px;left:20px;width:120px;height:100px}button{position:absolute;top:10px;left:10px;width:80px;height:40px}</style><main id="parent"><button data-visual="save">Save</button><div style="opacity:0"><button id="hidden">Hidden</button></div></main>`);
    await page.evaluate(() => window.scrollTo(0, 250));
    for (const fullPage of [false, true]) {
      const regions: DifferenceRegion[] = [{ x: 60, y: fullPage ? 620 : 120, width: 160, height: 80, mismatchPixels: 100, mismatchPercent: 1 }];
      await associateDifferenceRegions(page, regions, fullPage);
      const candidates = regions[0]!.domCandidates!;
      assert.equal(candidates[0]!.selector, '[data-visual="save"]');
      assert.equal(candidates[0]!.bounds.y, fullPage ? 620 : 120);
      assert.equal(candidates[0]!.parent!.selector, '#parent');
      assert.ok(candidates[0]!.styles['font-size']);
      assert.ok(!candidates.some(c => c.selector === '#hidden'));
      for (const candidate of candidates) assert.equal(await page.locator(candidate.selector).count(), 1);
    }
    await context.close();
  } finally { await browser.close(); }
});

test("adaptive diagnostics persist regional changes across candidate plus final and enforce small critical regions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "regional-verify-"));
  const browser = await launchVisualQaBrowser("chrome");
  try {
    const html = path.join(dir, "page.html");
    const write = (color: string) => fs.writeFile(html, `<style>body{margin:0;background:white}.page{position:relative;width:100%;min-height:100vh}#button{position:absolute;left:20px;top:20px;width:10px;height:10px;background:${color}}</style><main class="page"><div id="button"></div></main>`);
    await write("black");
    const visualCase = normalizeVisualCase({ name: "regional", url: pathToFileURL(html).href,
      viewport: { width: 200, height: 200 }, designImage: path.join(dir, "design.png"), outputDir: path.join(dir, "out"),
      wait: { networkIdle: false, stableFrames: 1 }, cssRules: { preferFlex: false },
      thresholds: { maxMismatchPercent: 100, minSsim: 0 },
      criticalRegions: [{ name: "button", bounds: { x: 20, y: 20, width: 10, height: 10 }, thresholds: { maxMismatchPercent: 0, minSsim: 1 } }],
    }, path.join(dir, "case.json"));
    await captureH5Screenshot(visualCase, visualCase.designImage, { browser });
    const options = { browser, skipCodeScan: true, mode: "adaptive" as const, cachePath: path.join(dir, "cache.json") };
    await write("red");
    const first = await verifyVisualCase(visualCase, options);
    assert.equal(first.status, "failed");
    assert.equal(first.comparison.criticalRegions![0]!.passed, false);
    assert.equal(first.comparison.regionIteration!.counts.new, 1);
    assert.equal(first.comparison.differenceRegions[0]!.domCandidates![0]!.selector, '#button');
    await verifyVisualCase(visualCase, options);
    const stagnant = await verifyVisualCase(visualCase, options);
    assert.equal(stagnant.workflow!.diagnosticStrategy, "parent-layout-and-fonts");
    const escalated = await verifyVisualCase(visualCase, options);
    assert.equal(escalated.mode, "agent");
    await write("black");
    const final = await verifyVisualCase(visualCase, options);
    assert.equal(final.workflow!.nextAction, "complete", JSON.stringify({ comparison: final.comparison, capture: final.capture }));
    assert.equal(final.mode, "final");
    assert.equal(final.comparison.regionIteration!.counts.resolved, 1);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

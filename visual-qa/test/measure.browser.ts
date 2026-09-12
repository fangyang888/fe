import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { launchVisualQaBrowser, captureH5Screenshot } from "../src/capture.js";
import { normalizeVisualCase } from "../src/config.js";
import { measureVisualCase } from "../src/measure-case.js";
import { verifyVisualCase } from "../src/verify.js";
import { inspectMeasurements } from "../src/measure.js";
import { inspectCssRules } from "../src/css-rules.js";

test("Chrome measures CSS coordinates, records iterations, and enforces contracts in verify", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-contract-browser-"));
  const browser = await launchVisualQaBrowser("chrome");
  try {
    const cssContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const cssPage = await cssContext.newPage();
    const cssRules = {
      preferFlex: true,
      allowGap: false,
      preferRem: true,
      preferResponsivePage: true,
      rejectSuspiciousCss: true,
      failOnMismatch: true,
      failOnSeverity: "error" as const,
      scopeSelector: "#app",
      pageShellSelector: ".page",
      positionContextMaxDepth: 2,
      ignoreSelectors: [],
    };
    await cssPage.setContent(`
      <style>
        * { box-sizing: border-box; }
        html { font-size: 10px; background: #fff47e; }
        .page { width: 100%; max-width: 37.5rem; min-height: 81.2rem; padding: 12px; border: 1px solid transparent; }
      </style>
      <div id="app"><main class="page">content</main></div>
    `);
    const invalidCss = await inspectCssRules(cssPage, cssRules);
    assert.equal(invalidCss.passed, false);
    assert.deepEqual(
      invalidCss.violations
        .filter((violation) => violation.rule === "responsive-page-size")
        .map((violation) => violation.property)
        .sort(),
      ["max-width", "min-height"],
    );
    assert.equal(
      invalidCss.violations.some(
        (violation) =>
          violation.rule === "global-style-leak" &&
          violation.selector === "html" &&
          violation.property === "font-size" &&
          violation.severity === "error",
      ),
      true,
      JSON.stringify(invalidCss.violations, null, 2),
    );
    assert.equal(
      invalidCss.violations.some(
        (violation) =>
          violation.rule === "prefer-rem" &&
          violation.property?.startsWith("padding-") &&
          violation.value === "12px" &&
          violation.severity === "error",
      ),
      true,
      JSON.stringify(invalidCss.violations, null, 2),
    );
    assert.equal(
      invalidCss.violations.some(
        (violation) =>
          violation.rule === "prefer-rem" &&
          violation.property?.startsWith("border") &&
          violation.value?.includes("1px"),
      ),
      false,
    );
    assert.equal(
      invalidCss.violations.some(
        (violation) =>
          violation.rule === "global-style-leak" &&
          violation.selector === "*" &&
          violation.severity === "warning",
      ),
      true,
    );

    await cssPage.setContent(`
      <style>
        .page,
        .page * { box-sizing: border-box; }
        .page { width: 100%; min-height: 100vh; padding: 1.2rem; border: 1px solid transparent; background: #fff47e; }
      </style>
      <div id="app"><main class="page">content</main></div>
    `);
    const validCss = await inspectCssRules(cssPage, cssRules);
    assert.equal(validCss.passed, true);
    assert.equal(
      validCss.violations.some(
        (violation) =>
          violation.rule === "responsive-page-size" ||
          violation.rule === "global-style-leak",
      ),
      false,
    );
    await cssContext.close();

    const html = path.join(directory, "page.html");
    await fs.writeFile(html, '<style>body{margin:0;height:1500px}#card{position:absolute;left:20px;top:20px;width:300px;height:100px;font-size:16px;color:red}#button{position:absolute;left:70px;top:144px;width:200px;height:40px}</style><div id="card">Card</div><div id="button">Button</div>');
    const visualCase = normalizeVisualCase({
      name: "browser-contract", url: pathToFileURL(html).href,
      designImage: path.join(directory, "design.png"), outputDir: directory,
      viewport: { width: 375, height: 300, deviceScaleFactor: 2 },
      wait: { networkIdle: false, stableFrames: 1 },
      contract: { elements: [
        { name: "card", selector: "#card", bounds: { x: 20, y: 20, width: 300 }, styles: { "font-size": 16, color: "rgb(255, 0, 0)" } },
        { name: "button", selector: "#button", relations: [{ target: "card", metric: "gapY", expected: 16 }] },
      ] },
    }, path.join(directory, "case.json"));
    const first = await measureVisualCase(visualCase, { browser });
    assert.equal(first.status, "failed");
    assert.equal(first.measurement!.issues.length, 1);
    assert.equal(first.measurement!.issues[0]!.delta, 8);
    assert.equal(first.measurement!.iteration!.baseline, true);
    assert.equal((await fs.readdir(directory)).some((name) => name.endsWith(".png")), false);
    const second = await measureVisualCase(visualCase, { browser });
    assert.equal(second.measurement!.iteration!.stagnantRounds, 1);

    const context = await browser.newContext({ viewport: { width: 375, height: 300 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(visualCase.url);
    await page.evaluate(() => window.scrollTo(0, 200));
    const scrolled = await inspectMeasurements(page, visualCase.contract!);
    assert.equal(scrolled.measurements[0]!.bounds!.y, 20);
    assert.equal(scrolled.issues.length, 1);
    await context.close();

    await captureH5Screenshot({ ...visualCase, cssRules: undefined }, visualCase.designImage, { browser });
    const verified = await verifyVisualCase({ ...visualCase, cssRules: undefined }, { browser, mode: "agent", projectRoot: directory });
    assert.equal(verified.comparison.passed, true);
    assert.equal(verified.status, "failed");
    assert.equal(verified.ai.shouldAnalyze, false);
    assert.equal(verified.cache.verificationReused, false);
    assert.equal(verified.capture.measurement!.iteration!.recommendImageReview, true);

    await fs.writeFile(html, (await fs.readFile(html, "utf8")).replace("top:144px", "top:136px"));
    const fixed = await measureVisualCase(visualCase, { browser });
    assert.equal(fixed.status, "passed");
    assert.equal(fixed.measurement!.iteration!.counts.resolved, 1);

    // A real pixel mismatch is withheld from image review until repeated measurements stall.
    await captureH5Screenshot({ ...visualCase, cssRules: undefined }, visualCase.designImage, { browser });
    await fs.writeFile(html, (await fs.readFile(html, "utf8")).replace("top:136px", "top:160px"));
    const stagedCase = { ...visualCase, cssRules: undefined, outputDir: path.join(directory, "staged"), thresholds: { maxMismatchPercent: 0, minSsim: 1 } };
    for (let round = 0; round < 3; round += 1) {
      const staged = await verifyVisualCase(stagedCase, { browser, mode: "agent", projectRoot: directory });
      assert.equal(staged.cache.verificationReused, false);
      assert.equal(staged.comparison.passed, false);
      assert.equal(staged.ai.shouldAnalyze, round === 2);
      assert.equal(Boolean(staged.artifacts.diagnosticCrops?.length), round === 2);
    }
  } finally {
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { captureH5Screenshot, launchVisualQaBrowser } from "../src/capture.js";
import { normalizeVisualCase } from "../src/config.js";
import { runCssVariants } from "../src/variants.js";

test("variants isolate CSS, rank against baseline and preserve business source", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-variants-test-"));
  const html = '<style>.box { width:100px;height:100px;background:red }</style><main><div class="box"></div></main>';
  const pagePath = path.join(directory, "page.html");
  await fs.writeFile(pagePath, html);
  const casePath = path.join(directory, "case.json");
  const visualCase = normalizeVisualCase({
    name: "fixture", url: pathToFileURL(pagePath).href,
    designImage: path.join(directory, "design.png"), viewport: { width: 200, height: 200 },
    wait: { networkIdle: false, stableFrames: 2 },
  }, casePath);
  const browser = await launchVisualQaBrowser();
  try {
    await captureH5Screenshot({ ...visualCase, styleOverrides: ".box { background: green }" },
      visualCase.designImage, { browser });
  } finally { await browser.close(); }
  await fs.writeFile(casePath, JSON.stringify(visualCase));
  const config = path.join(directory, "variants.json");
  await fs.writeFile(config, JSON.stringify({
    case: "./case.json", outputDir: "./results", projectRoot: directory,
    variants: [
      { name: "green", css: ".box { background: green }" },
      { name: "blue", css: ".box { background: blue }" },
      { name: "smaller", css: ".box { width: 90px }" },
    ],
  }));
  const serial = await runCssVariants(config, 1);
  const parallel = await runCssVariants(config, 4);
  for (const result of [serial, parallel]) {
    assert.equal(result.best, "green");
    assert.equal(result.ranking[0]?.mismatchPercent, 0);
    assert.equal(result.ranking.length, 4);
    assert.ok(result.ranking.find(r => r.name === "baseline")!.mismatchPercent! > 0);
    const report = JSON.parse(await fs.readFile(result.ranking[0]!.reportPath!, "utf8"));
    assert.equal(report.capture.timings.browserMode, "shared");
    assert.equal(report.mode, "final");
  }
  assert.deepEqual(serial.ranking.map(r => [r.name, r.mismatchPercent]),
    parallel.ranking.map(r => [r.name, r.mismatchPercent]));
  assert.equal(await fs.readFile(pagePath, "utf8"), html);
  console.log(JSON.stringify({ serialMs: serial.timings.totalMs, parallelMs: parallel.timings.totalMs,
    candidates: 4, artifacts: parallel.artifacts }));
});

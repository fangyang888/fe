import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import {
  compareScreenshots,
  writeComparisonCrops,
} from "../src/compare.js";

async function writeImage(filePath: string, color: [number, number, number]): Promise<void> {
  const image = new PNG({ width: 32, height: 32 });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = color[0];
    image.data[index + 1] = color[1];
    image.data[index + 2] = color[2];
    image.data[index + 3] = 255;
  }
  await fs.writeFile(filePath, PNG.sync.write(image));
}

async function writeBlocks(
  filePath: string,
  blocks: Array<{ x: number; y: number; width: number; height: number }>,
): Promise<void> {
  const image = new PNG({ width: 32, height: 32 });
  image.data.fill(255);
  for (const block of blocks) {
    for (let y = block.y; y < block.y + block.height; y += 1) {
      for (let x = block.x; x < block.x + block.width; x += 1) {
        const index = (y * image.width + x) * 4;
        image.data[index] = 0;
        image.data[index + 1] = 0;
        image.data[index + 2] = 0;
      }
    }
  }
  await fs.writeFile(filePath, PNG.sync.write(image));
}

test("passes identical screenshots and writes a diff", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeImage(actualPath, [255, 255, 255]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath);

  assert.equal(result.passed, true);
  assert.equal(result.mismatchPixels, 0);
  assert.equal(result.ssim, 1);
  assert.ok(result.timings.totalMs >= 0);
  assert.equal((await fs.stat(diffPath)).isFile(), true);
});

test("fails visibly different screenshots", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeImage(actualPath, [0, 0, 0]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath);

  assert.equal(result.passed, false);
  assert.equal(result.mismatchPercent, 100);
  assert.ok(result.ssim !== null && result.ssim < 0.1);
});

test("keeps defaults when optional threshold values are undefined", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeImage(actualPath, [255, 255, 255]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath, {
    maxMismatchPercent: undefined,
    minSsim: undefined,
  });

  assert.equal(result.passed, true);
  assert.equal(result.thresholds.maxMismatchPercent, 1.5);
  assert.equal(result.thresholds.minSsim, 0.98);
});

test("limits comparison to changed regions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeBlocks(actualPath, [
    { x: 2, y: 2, width: 2, height: 2 },
    { x: 24, y: 24, width: 4, height: 4 },
  ]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath, {
    includeRegions: [{ x: 0, y: 0, width: 8, height: 8 }],
    maxMismatchPercent: 100,
    minSsim: 0.01,
  });

  assert.equal(result.mismatchPixels, 4);
  assert.deepEqual(result.comparedRegions, [
    { x: 0, y: 0, width: 8, height: 8 },
  ]);
});

test("keeps only the largest requested difference regions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeBlocks(actualPath, [
    { x: 1, y: 1, width: 2, height: 2 },
    { x: 20, y: 20, width: 6, height: 6 },
  ]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath, {
    topRegions: 1,
  });

  assert.equal(result.differenceRegions.length, 1);
  assert.equal(result.differenceRegions[0]?.mismatchPixels, 36);
});

test("quick comparison skips SSIM and difference-region analysis", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const diffPath = path.join(directory, "diff.png");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeImage(actualPath, [0, 0, 0]);

  const result = await compareScreenshots(expectedPath, actualPath, diffPath, {
    computeSsim: false,
    analyzeDifferenceRegions: false,
  });

  assert.equal(result.passed, false);
  assert.equal(result.ssim, null);
  assert.deepEqual(result.differenceRegions, []);
});

test("writes compact side-by-side diagnostic crops", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-"));
  const expectedPath = path.join(directory, "expected.png");
  const actualPath = path.join(directory, "actual.png");
  const outputDirectory = path.join(directory, "diagnostics");
  await writeImage(expectedPath, [255, 255, 255]);
  await writeImage(actualPath, [0, 0, 0]);

  const files = await writeComparisonCrops(
    expectedPath,
    actualPath,
    [{ x: 8, y: 8, width: 8, height: 8 }],
    outputDirectory,
    2,
  );
  const image = PNG.sync.read(await fs.readFile(files[0]!));

  assert.equal(files.length, 1);
  assert.equal(image.width, 26);
  assert.equal(image.height, 12);
});

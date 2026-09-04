import { promises as fs } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { DEFAULT_THRESHOLDS } from "./config.js";
import type {
  ComparisonResult,
  DifferenceRegion,
  RectangleBounds,
  VisualThresholds,
} from "./types.js";

export interface ComparisonOptions extends VisualThresholds {
  includeRegions?: RectangleBounds[];
  topRegions?: number;
  computeSsim?: boolean;
  analyzeDifferenceRegions?: boolean;
  differenceRegionsOnFailureOnly?: boolean;
}

async function readPng(filePath: string): Promise<PNG> {
  return PNG.sync.read(await fs.readFile(filePath));
}

function normalizeRegions(
  regions: RectangleBounds[] | undefined,
  width: number,
  height: number,
): RectangleBounds[] {
  if (!regions?.length) return [{ x: 0, y: 0, width, height }];
  return regions.map((region) => {
    const x = Math.max(0, Math.floor(region.x));
    const y = Math.max(0, Math.floor(region.y));
    const right = Math.min(width, Math.ceil(region.x + region.width));
    const bottom = Math.min(height, Math.ceil(region.y + region.height));
    if (right <= x || bottom <= y) {
      throw new Error(`Comparison region is outside the screenshot: ${JSON.stringify(region)}`);
    }
    return { x, y, width: right - x, height: bottom - y };
  });
}

function crop(image: PNG, bounds: RectangleBounds): Uint8Array {
  const output = new Uint8Array(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.y + y) * image.width + bounds.x) * 4;
    const targetStart = y * bounds.width * 4;
    output.set(
      image.data.subarray(sourceStart, sourceStart + bounds.width * 4),
      targetStart,
    );
  }
  return output;
}

function paddedBounds(
  bounds: RectangleBounds,
  width: number,
  height: number,
  padding: number,
): RectangleBounds {
  const x = Math.max(0, Math.floor(bounds.x - padding));
  const y = Math.max(0, Math.floor(bounds.y - padding));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width + padding));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height + padding));
  return { x, y, width: right - x, height: bottom - y };
}

export async function writeComparisonCrops(
  expectedPath: string,
  actualPath: string,
  regions: RectangleBounds[],
  outputDirectory: string,
  padding = 16,
): Promise<string[]> {
  if (regions.length === 0) return [];
  const [expected, actual] = await Promise.all([
    readPng(expectedPath),
    readPng(actualPath),
  ]);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error("Cannot create diagnostic crops from differently sized images");
  }
  await fs.mkdir(outputDirectory, { recursive: true });
  const files: string[] = [];
  for (const [index, region] of regions.entries()) {
    const bounds = paddedBounds(
      region,
      expected.width,
      expected.height,
      Math.max(0, padding),
    );
    const divider = 2;
    const output = new PNG({
      width: bounds.width * 2 + divider,
      height: bounds.height,
    });
    const expectedCrop = crop(expected, bounds);
    const actualCrop = crop(actual, bounds);
    for (let y = 0; y < bounds.height; y += 1) {
      const sourceStart = y * bounds.width * 4;
      const sourceEnd = sourceStart + bounds.width * 4;
      const targetRow = y * output.width * 4;
      output.data.set(expectedCrop.subarray(sourceStart, sourceEnd), targetRow);
      const dividerStart = targetRow + bounds.width * 4;
      for (let x = 0; x < divider; x += 1) {
        const pixel = dividerStart + x * 4;
        output.data[pixel] = 255;
        output.data[pixel + 1] = 0;
        output.data[pixel + 2] = 128;
        output.data[pixel + 3] = 255;
      }
      output.data.set(
        actualCrop.subarray(sourceStart, sourceEnd),
        dividerStart + divider * 4,
      );
    }
    const file = path.join(outputDirectory, `difference-${index + 1}.png`);
    await fs.writeFile(file, PNG.sync.write(output));
    files.push(file);
  }
  return files;
}

function copyCropToImage(
  source: Uint8Array,
  target: Buffer,
  targetWidth: number,
  bounds: RectangleBounds,
): void {
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = y * bounds.width * 4;
    const targetStart = ((bounds.y + y) * targetWidth + bounds.x) * 4;
    target.set(
      source.subarray(sourceStart, sourceStart + bounds.width * 4),
      targetStart,
    );
  }
}

function mergeDifferenceRegions(
  regions: DifferenceRegion[],
  distance = 8,
): DifferenceRegion[] {
  const merged = [...regions];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let leftIndex = 0; leftIndex < merged.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < merged.length; rightIndex += 1) {
        const left = merged[leftIndex]!;
        const right = merged[rightIndex]!;
        const separated =
          left.x + left.width + distance < right.x ||
          right.x + right.width + distance < left.x ||
          left.y + left.height + distance < right.y ||
          right.y + right.height + distance < left.y;
        if (separated) continue;
        const x = Math.min(left.x, right.x);
        const y = Math.min(left.y, right.y);
        const edgeX = Math.max(left.x + left.width, right.x + right.width);
        const edgeY = Math.max(left.y + left.height, right.y + right.height);
        const mismatchPixels = left.mismatchPixels + right.mismatchPixels;
        const width = edgeX - x;
        const height = edgeY - y;
        merged[leftIndex] = {
          x,
          y,
          width,
          height,
          mismatchPixels,
          mismatchPercent: (mismatchPixels / (width * height)) * 100,
        };
        merged.splice(rightIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

function findDifferenceRegions(
  diff: PNG,
  limit: number,
): DifferenceRegion[] {
  const changed = new Uint8Array(diff.width * diff.height);
  for (let index = 0; index < changed.length; index += 1) {
    if ((diff.data[index * 4 + 3] ?? 0) > 0) changed[index] = 1;
  }
  const visited = new Uint8Array(changed.length);
  const regions: DifferenceRegion[] = [];
  for (let start = 0; start < changed.length; start += 1) {
    if (!changed[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let minX = diff.width;
    let minY = diff.height;
    let maxX = 0;
    let maxY = 0;
    let mismatchPixels = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++]!;
      const x = index % diff.width;
      const y = Math.floor(index / diff.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      mismatchPixels += 1;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= diff.width ||
            nextY >= diff.height
          ) {
            continue;
          }
          const next = nextY * diff.width + nextX;
          if (changed[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    regions.push({
      x: minX,
      y: minY,
      width,
      height,
      mismatchPixels,
      mismatchPercent: (mismatchPixels / (width * height)) * 100,
    });
  }
  return mergeDifferenceRegions(regions)
    .sort((left, right) => right.mismatchPixels - left.mismatchPixels)
    .slice(0, limit);
}

export async function compareScreenshots(
  expectedPath: string,
  actualPath: string,
  diffPath: string,
  options: ComparisonOptions = {},
): Promise<ComparisonResult> {
  const totalStarted = Date.now();
  const readStarted = Date.now();
  const [expected, actual] = await Promise.all([
    readPng(expectedPath),
    readPng(actualPath),
  ]);
  const readMs = Date.now() - readStarted;
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `Screenshot dimensions differ: expected ${expected.width}x${expected.height}, actual ${actual.width}x${actual.height}`,
    );
  }

  const thresholds: Required<VisualThresholds> = {
    pixelThreshold:
      options.pixelThreshold ?? DEFAULT_THRESHOLDS.pixelThreshold,
    maxMismatchPercent:
      options.maxMismatchPercent ??
      DEFAULT_THRESHOLDS.maxMismatchPercent,
    minSsim: options.minSsim ?? DEFAULT_THRESHOLDS.minSsim,
  };
  const diff = new PNG({ width: expected.width, height: expected.height });
  const comparedRegions = normalizeRegions(
    options.includeRegions,
    expected.width,
    expected.height,
  );
  let mismatchPixels = 0;
  let totalPixels = 0;
  let weightedSimilarity = 0;
  const computeSsim = options.computeSsim !== false;
  const compareStarted = Date.now();
  for (const region of comparedRegions) {
    const expectedCrop = crop(expected, region);
    const actualCrop = crop(actual, region);
    const diffCrop = new Uint8Array(region.width * region.height * 4);
    const regionMismatch = pixelmatch(
      expectedCrop,
      actualCrop,
      diffCrop,
      region.width,
      region.height,
      { threshold: thresholds.pixelThreshold, diffMask: true },
    );
    const regionPixels = region.width * region.height;
    const regionSimilarity =
      computeSsim && region.width > 1 && region.height > 1
        ? ssim(
            {
              data: new Uint8ClampedArray(expectedCrop),
              width: region.width,
              height: region.height,
            },
            {
              data: new Uint8ClampedArray(actualCrop),
              width: region.width,
              height: region.height,
            },
            { ssim: "fast" },
          ).mssim
        : computeSsim
          ? 1 - regionMismatch / regionPixels
          : 0;
    mismatchPixels += regionMismatch;
    totalPixels += regionPixels;
    weightedSimilarity += regionSimilarity * regionPixels;
    copyCropToImage(diffCrop, diff.data, diff.width, region);
  }
  const compareMs = Date.now() - compareStarted;
  const mismatchPercent = (mismatchPixels / totalPixels) * 100;
  const similarity = computeSsim ? weightedSimilarity / totalPixels : null;
  const passed =
    mismatchPercent <= thresholds.maxMismatchPercent &&
    (similarity === null || similarity >= thresholds.minSsim);

  const differenceRegionsStarted = Date.now();
  const differenceRegions =
    options.analyzeDifferenceRegions === false ||
    (options.differenceRegionsOnFailureOnly && passed)
      ? []
      : findDifferenceRegions(diff, options.topRegions ?? 3);
  const differenceRegionsMs = Date.now() - differenceRegionsStarted;
  const writeStarted = Date.now();
  await fs.mkdir(path.dirname(diffPath), { recursive: true });
  await fs.writeFile(diffPath, PNG.sync.write(diff));
  const writeMs = Date.now() - writeStarted;

  return {
    expectedPath,
    actualPath,
    diffPath,
    width: expected.width,
    height: expected.height,
    mismatchPixels,
    mismatchPercent,
    ssim: similarity,
    passed,
    thresholds,
    ...(options.includeRegions?.length ? { comparedRegions } : {}),
    differenceRegions,
    timings: {
      readMs,
      compareMs,
      differenceRegionsMs,
      writeMs,
      totalMs: Date.now() - totalStarted,
    },
  };
}

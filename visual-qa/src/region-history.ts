import { promises as fs } from "node:fs";
import { PNG } from "pngjs";
import type { DifferenceRegion, RectangleBounds, RegionIteration } from "./types.js";

type Tracked = RectangleBounds & { id: string; pixels: number };
interface History { version: 1; identity: string; width: number; height: number; sequence: number; regions: Tracked[] }
const limit = 12;

function pixelsIn(image: PNG, bounds: RectangleBounds): number {
  let count = 0;
  for (let y = Math.max(0, Math.floor(bounds.y)); y < Math.min(image.height, Math.ceil(bounds.y + bounds.height)); y++) {
    for (let x = Math.max(0, Math.floor(bounds.x)); x < Math.min(image.width, Math.ceil(bounds.x + bounds.width)); x++) {
      if (image.data[(y * image.width + x) * 4 + 3]! > 0) count++;
    }
  }
  return count;
}

/** Fixed screenshot boxes: disappearance from top-N alone never means resolved. */
export async function recordRegionHistory(
  diffPath: string, regions: DifferenceRegion[], historyPath: string, identity: string, persist = true,
): Promise<RegionIteration> {
  const image = PNG.sync.read(await fs.readFile(diffPath));
  let previous: History | undefined;
  try {
    const value = JSON.parse(await fs.readFile(historyPath, "utf8")) as History;
    if (value.version === 1 && value.identity === identity && value.width === image.width && value.height === image.height &&
      Number.isSafeInteger(value.sequence) && value.sequence >= 0 && Array.isArray(value.regions) && value.regions.length <= limit &&
      value.regions.every(r => typeof r.id === "string" && [r.x, r.y, r.width, r.height, r.pixels].every(Number.isFinite) &&
        r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.pixels >= 0 && r.x + r.width <= image.width && r.y + r.height <= image.height)) previous = value;
  } catch { /* Missing or invalid history starts a fresh baseline. */ }
  let sequence = previous?.sequence ?? 0;
  const result: RegionIteration = { baselineReset: !previous, scope: "tracked-screenshot-regions",
    counts: { new: 0, improved: 0, worsened: 0, resolved: 0, unchanged: 0 }, regions: [], truncated: false };
  const tracked = previous?.regions ?? [];
  for (const region of tracked) {
    const currentPixels = pixelsIn(image, region);
    const delta = currentPixels - region.pixels;
    const state = currentPixels === 0 ? "resolved" : delta < 0 ? "improved" : delta > 0 ? "worsened" : "unchanged";
    const { pixels, ...bounds } = region;
    result.regions.push({ ...bounds, state, previousPixels: pixels, currentPixels, delta });
    result.counts[state]++;
  }
  for (const region of regions) {
    // Only complete containment is covered; a larger/moved diff gets a new observation.
    if (tracked.some(old => region.x >= old.x && region.y >= old.y && region.x + region.width <= old.x + old.width && region.y + region.height <= old.y + old.height)) continue;
    if (result.regions.length >= limit) { result.truncated = true; continue; }
    const { x, y, width, height } = region;
    if (pixelsIn(image, region) === 0) continue;
    result.regions.push({ x, y, width, height, id: `region-${++sequence}`, state: "new", previousPixels: null,
      currentPixels: pixelsIn(image, region), delta: null });
    result.counts.new++;
  }
  if (persist) {
    const history: History = { version: 1, identity, width: image.width, height: image.height, sequence,
      regions: result.regions.filter(r => r.currentPixels > 0).map(({ id, x, y, width, height, currentPixels }) =>
        ({ id, x, y, width, height, pixels: currentPixels })) };
    await fs.writeFile(historyPath, JSON.stringify(history), "utf8");
  }
  return result;
}

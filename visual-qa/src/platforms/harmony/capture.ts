import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import type { HarmonyCase, RectangleBounds } from "../../types.js";
import { createHdcRunner, detectHarmonyDevices, selectHarmonyDevice, HarmonyError, type HdcRunner, type HarmonyDevice } from "./device.js";

export interface HarmonyCaptureOptions { pageReady?: boolean; runner?: HdcRunner }
export interface HarmonyCapture {
  source: "device" | "import";
  device?: HarmonyDevice;
  importedFrom?: string;
  navigation: "manual" | "configured" | "computer-use" | "not-executed";
  rawPath: string;
  outputPath: string;
  rawSize: { width: number; height: number };
  crop: RectangleBounds;
  readiness: { method: "consecutive-identical-pixels" | "not-checked-import"; stableSamples?: number; pageConfirmed: boolean };
  warnings: string[];
}
export function cropNativeImage(raw: PNG, region?: RectangleBounds): PNG {
  if (!region) return raw;
  const { x, y, width, height } = region;
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > raw.width || y + height > raw.height) {
    throw new HarmonyError("alignment", "INVALID_CROP", `Crop must fit within raw screenshot ${raw.width}x${raw.height}`);
  }
  const cropped = new PNG({ width, height });
  PNG.bitblt(raw, cropped, x, y, width, height, 0, 0);
  return cropped;
}
export async function captureHarmonyScreenshot(c: HarmonyCase, outputPath: string, options: HarmonyCaptureOptions = {}): Promise<HarmonyCapture> {
  const h = c.harmony;
  const rawPath = path.join(path.dirname(outputPath), "raw.png");
  const region = h.capture?.scope === "region" ? h.capture.region : undefined;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const warnings: string[] = [];
  const save = async (bytes: Buffer, device?: HarmonyDevice): Promise<HarmonyCapture> => {
    const raw = PNG.sync.read(bytes);
    const cropped = cropNativeImage(raw, region);
    await fs.writeFile(rawPath, bytes);
    await fs.writeFile(outputPath, PNG.sync.write(cropped));
    return {
      source: device ? "device" : "import", ...(device ? { device } : { importedFrom: h.screenshot }),
      navigation: device ? h.navigation ?? "manual" : "not-executed",
      rawPath, outputPath, rawSize: { width: raw.width, height: raw.height },
      crop: region ?? { x: 0, y: 0, width: raw.width, height: raw.height },
      readiness: device
        ? { method: "consecutive-identical-pixels", stableSamples: h.stableSamples ?? 2, pageConfirmed: options.pageReady === true }
        : { method: "not-checked-import", pageConfirmed: false },
      warnings,
    };
  };
  if (h.screenshot) return save(await fs.readFile(h.screenshot));
  const run = options.runner ?? createHdcRunner(h.hdcPath);
  const device = selectHarmonyDevice(await detectHarmonyDevices(run), h.deviceId);
  const navigation = h.navigation ?? "manual";
  if (navigation !== "configured" && !options.pageReady) throw new HarmonyError("preparation", "PAGE_NOT_CONFIRMED", `Prepare the target page using ${navigation}, then pass --page-ready. CLI does not invoke Computer Use.`);
  if (navigation === "configured") {
    try {
      if (!h.bundleName || !h.abilityName || ![h.bundleName, h.abilityName].every(value => /^[a-zA-Z0-9_][a-zA-Z0-9_.]*$/.test(value))) throw new Error("Missing or invalid bundleName or abilityName");
      const result = await run(["-t", device.id, "shell", "aa", "start", "-b", h.bundleName, "-a", h.abilityName], h.timeoutMs);
      if (!/start ability successfully/i.test(result)) throw new Error(`Could not confirm Ability launch: ${result}`);
    } catch (error) { throw new HarmonyError("preparation", "LAUNCH_FAILED", String(error)); }
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-harmony-"));
  const remote = `/data/local/tmp/visual-qa-${randomUUID()}.png`;
  const local = path.join(temporary, "screen.png");
  const timeout = h.timeoutMs ?? 15000;
  const deadline = Date.now() + timeout;
  let previous: PNG | undefined;
  let stable = 0;
  let latest: Buffer | undefined;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new HarmonyError("capture", "UNSTABLE_SCREEN", "Screenshot did not stabilize before timeout; check animations or define the intended content region");
    return ms;
  };
  try {
    while (stable < (h.stableSamples ?? 2)) {
      // Remove only our generated path so a silent capture failure cannot reuse an old frame.
      await run(["-t", device.id, "shell", "rm", "-f", remote], remaining());
      await run(["-t", device.id, "shell", "uitest", "screenCap", "-p", remote], remaining());
      await fs.rm(local, { force: true });
      await run(["-t", device.id, "file", "recv", remote, local], remaining());
      latest = await fs.readFile(local);
      const current = cropNativeImage(PNG.sync.read(latest), region);
      stable = previous && previous.width === current.width && previous.height === current.height && previous.data.equals(current.data) ? stable + 1 : 1;
      previous = current;
      if (stable < (h.stableSamples ?? 2)) await new Promise(resolve => setTimeout(resolve, Math.min(h.sampleIntervalMs ?? 500, remaining())));
    }
    // Persist evidence before cleanup; cleanup warnings remain visible in the returned object.
    return await save(latest!, device);
  } finally {
    if (latest) await fs.writeFile(rawPath, latest);
    try { await run(["-t", device.id, "shell", "rm", "-f", remote], 3000); }
    catch (error) { warnings.push(`Temporary device screenshot cleanup failed: ${String(error)}`); }
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

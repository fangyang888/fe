import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type HarmonyStage = "device" | "preparation" | "capture" | "alignment" | "comparison";
export class HarmonyError extends Error {
  constructor(public stage: HarmonyStage, public code: string, message: string) { super(message); }
}
export type HdcRunner = (args: string[], timeoutMs?: number) => Promise<string>;

export function createHdcRunner(executable = "hdc"): HdcRunner {
  return async (args, timeoutMs = 15000) => {
    try {
      const { stdout, stderr } = await promisify(execFile)(executable, args, {
        timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8", windowsHide: true,
      });
      const output = `${stdout}\n${stderr}`.trim();
      // hdc and remote shell commands may report a failure with exit code zero.
      if (/\[Fail\]|\berror\b|\bfailed\b|not found|not permitted|permission denied|not connected/i.test(output)) throw new Error(output);
      return output;
    } catch (error) {
      throw new Error(`hdc ${args.slice(0, 4).join(" ")}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
export interface HarmonyDevice {
  id: string;
  reachable: boolean;
  kind: "unknown";
  model?: string;
  deviceType?: string;
  error?: string;
}
export function parseTargets(output: string): string[] {
  if (!output.trim() || output.trim() === "[Empty]") return [];
  const ids = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (ids.some(id => !/^[a-zA-Z0-9_.:[\]-]+$/.test(id) || id.startsWith("-"))) {
    throw new HarmonyError("device", "INVALID_TARGET_LIST", `Unexpected hdc target list: ${output}`);
  }
  return [...new Set(ids)];
}
export async function detectHarmonyDevices(run: HdcRunner = createHdcRunner()): Promise<HarmonyDevice[]> {
  let ids: string[];
  try { ids = parseTargets(await run(["list", "targets"])); }
  catch (error) { throw new HarmonyError("device", "HDC_UNAVAILABLE", String(error)); }
  return Promise.all(ids.map(async id => {
    try {
      const probe = await run(["-t", id, "shell", "echo", "visual-qa-ready"]);
      if (probe.trim() !== "visual-qa-ready") throw new Error("Device shell did not respond to readiness probe");
      const metadata = async (key: string) => {
        try { return (await run(["-t", id, "shell", "param", "get", key])).trim() || undefined; }
        catch { return undefined; }
      };
      const [model, deviceType] = await Promise.all([metadata("const.product.model"), metadata("const.product.devicetype")]);
      // USB/TCP and phone/tablet do not reliably distinguish physical devices from emulators.
      return { id, reachable: true, kind: "unknown" as const, model, deviceType };
    } catch (error) { return { id, reachable: false, kind: "unknown" as const, error: String(error) }; }
  }));
}
export function selectHarmonyDevice(devices: HarmonyDevice[], requested = "auto"): HarmonyDevice {
  if (requested !== "auto") {
    const target = devices.find(d => d.id === requested);
    if (!target?.reachable) throw new HarmonyError("device", "DEVICE_UNAVAILABLE", `Requested device ${requested} is unavailable; no fallback selected`);
    return target;
  }
  const available = devices.filter(d => d.reachable);
  if (available.length === 0) throw new HarmonyError("device", "NO_DEVICE", "No reachable device. Connect a debugging device/emulator or explicitly configure harmony.screenshot");
  if (available.length > 1) throw new HarmonyError("device", "MULTIPLE_DEVICES", `Set harmony.deviceId: ${available.map(d => d.id).join(", ")}`);
  return available[0]!;
}

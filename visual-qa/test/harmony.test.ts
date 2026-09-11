import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import { normalizeVisualCase } from "../src/config.js";
import type { HarmonyCase } from "../src/types.js";
import { createHdcRunner, detectHarmonyDevices, parseTargets, selectHarmonyDevice, type HdcRunner } from "../src/platforms/harmony/device.js";
import { captureHarmonyScreenshot, cropNativeImage } from "../src/platforms/harmony/capture.js";
import { verifyHarmonyCase } from "../src/platforms/harmony/verify.js";
import { writeAgentContext } from "../src/agent-context.js";

function png(width = 12, height = 12, color = 255) {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) { image.data[i] = color; image.data[i + 1] = color; image.data[i + 2] = color; image.data[i + 3] = 255; }
  return image;
}
const base: HarmonyCase = { platform: "harmony", name: "native", designImage: "design.png", harmony: {} };
async function fixture(t: any) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vqa-harmony-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "design.png"), PNG.sync.write(png()));
  await fs.writeFile(path.join(directory, "import.png"), PNG.sync.write(png()));
  return { directory, c: normalizeVisualCase({ ...base, harmony: { screenshot: "import.png" } }, path.join(directory, "case.json")) };
}
function fakeDevice(bytes: Buffer, calls: string[][], overrides: { changing?: boolean; corrupt?: boolean; cleanupFail?: boolean } = {}): HdcRunner {
  let frame = 0;
  let cleanupCalls = 0;
  return async args => {
    calls.push(args);
    if (args[0] === "list") return "device-1";
    if (args.includes("echo")) return "visual-qa-ready";
    if (args.includes("param")) return "phone";
    if (args.includes("aa")) return "start ability successfully.";
    if (args.includes("screenCap")) return "Screen capture saved";
    if (args.includes("recv")) {
      await fs.writeFile(args.at(-1)!, overrides.corrupt ? "not a png" : overrides.changing ? PNG.sync.write(png(12, 12, frame++ % 2 ? 0 : 255)) : bytes);
      return "FileTransfer finish";
    }
    if (args.includes("rm")) { if (overrides.cleanupFail && ++cleanupCalls >= 3) throw new Error("disconnected"); return ""; }
    throw new Error(`Unexpected command ${args}`);
  };
}

test("Harmony config has no browser defaults and resolves import paths", () => {
  const c = normalizeVisualCase({ ...base, harmony: { screenshot: "shot.png" } }, "/tmp/project/case.json");
  assert.equal(c.harmony.screenshot, "/tmp/project/shot.png");
  assert.equal(c.harmony.navigation, "manual");
  assert.equal(c.cssRules, undefined);
  assert.equal(c.viewport, undefined);
  for (const field of ["viewport", "url", "contract", "cssRules", "wait", "changeDetection"]) {
    assert.throws(() => normalizeVisualCase({ ...base, [field]: {} } as any, "/tmp/case.json"), /does not support/);
  }
  for (const harmony of [
    { deviceId: "abc;rm" }, { navigation: "bogus" }, { navigation: "configured" },
    { stableSamples: 1 }, { timeoutMs: -2 }, { sampleIntervalMs: 0 },
    { capture: { scope: "region", region: { x: -1, y: 0, width: 2, height: 2 } } },
    { screenshot: "x.png", navigation: "computer-use" },
  ]) assert.throws(() => normalizeVisualCase({ ...base, harmony } as any, "/tmp/case.json"));
  assert.throws(() => normalizeVisualCase({ ...base, platform: "android" } as any, "/tmp/case.json"), /platform/);
});

test("device list distinguishes empty, invalid, unreachable and ambiguous targets", async () => {
  assert.deepEqual(parseTargets("[Empty]\n"), []);
  assert.deepEqual(parseTargets("abc\n127.0.0.1:1234\nabc"), ["abc", "127.0.0.1:1234"]);
  assert.throws(() => parseTargets("[Fail] unable to connect"));
  const devices = await detectHarmonyDevices(async args => {
    if (args[0] === "list") return "a\nb";
    if (args[1] === "b") throw new Error("offline");
    if (args.includes("echo")) return "visual-qa-ready";
    return "phone";
  });
  assert.equal(selectHarmonyDevice(devices).id, "a");
  assert.equal(devices[0]?.kind, "unknown");
  assert.throws(() => selectHarmonyDevice(devices, "b"), /unavailable/);
  assert.throws(() => selectHarmonyDevice([]), /No reachable/);
  assert.throws(() => selectHarmonyDevice([devices[0]!, { ...devices[0]!, id: "c" }]), /deviceId/);
});

test("hdc adapter rejects zero-exit failure and missing executable", async () => {
  await assert.rejects(createHdcRunner(process.execPath)(["-e", 'console.log("[Fail] disconnected")']), /disconnected/);
  await assert.rejects(detectHarmonyDevices(createHdcRunner("/no/such/hdc")), /HDC|hdc/);
});

test("region crop uses exact raw pixels and rejects out-of-bounds instead of resizing", () => {
  const raw = png(4, 4); raw.data[20] = 33;
  const cropped = cropNativeImage(raw, { x: 1, y: 1, width: 2, height: 2 });
  assert.equal(cropped.data[0], 33);
  assert.throws(() => cropNativeImage(raw, { x: 3, y: 0, width: 2, height: 2 }), /fit within/);
});

test("import verification routes through CLI, reports scope, and re-reads changed pixels", async t => {
  const { directory, c } = await fixture(t);
  const file = path.join(directory, "case.json");
  await fs.writeFile(file, JSON.stringify(c));
  const cli = path.resolve("dist/src/cli.js");
  const first = await promisify(execFile)(process.execPath, [cli, "verify", "--case", file, "--mode", "agent", "--reuse-verification"]);
  const summary = JSON.parse(first.stdout);
  assert.equal(summary.status, "passed");
  assert.equal(summary.scope, "native-screenshot-visual-only");
  assert.equal(summary.checks.dom, "not-applicable");
  await fs.writeFile(path.join(directory, "import.png"), PNG.sync.write(png(12, 12, 0)));
  const second = await verifyHarmonyCase(c, { mode: "final", reuseVerification: true });
  assert.equal(second.status, "failed");
  assert.equal(second.cache.verificationReused, false);
  assert.ok(second.artifacts.diagnosticCrops?.length);
  assert.notEqual(summary.artifacts.actual, second.artifacts.actual);
  const contextFile = path.join(directory, "agent-context.json");
  await writeAgentContext({ casePath: file, outputPath: contextFile, reportPath: second.artifacts.report });
  assert.equal(JSON.parse(await fs.readFile(contextFile, "utf8")).verification.scope, "native-screenshot-visual-only");
});

test("import alignment failures are persisted and do not expose old actual artifacts", async t => {
  const { directory, c } = await fixture(t);
  const first = await verifyHarmonyCase(c);
  assert.equal(first.status, "passed");
  await fs.writeFile(path.join(directory, "import.png"), PNG.sync.write(png(8, 8)));
  const second = await verifyHarmonyCase(c);
  assert.equal(second.failure?.stage, "alignment");
  assert.match(second.failure!.message, /dimensions differ/);
  await fs.rm(path.join(directory, "import.png"));
  const third = await verifyHarmonyCase(c);
  assert.equal(third.failure?.stage, "capture");
  assert.equal(third.artifacts.actual, undefined);
  assert.equal(JSON.parse(await fs.readFile(third.artifacts.report, "utf8")).status, "failed");
});

test("manual and Computer Use captures require per-run page confirmation", async t => {
  const { directory } = await fixture(t);
  for (const navigation of ["manual", "computer-use"] as const) {
    const calls: string[][] = [];
    const c = normalizeVisualCase({ ...base, harmony: { navigation, sampleIntervalMs: 50 } }, path.join(directory, "case.json"));
    const runner = fakeDevice(PNG.sync.write(png()), calls);
    const blocked = await verifyHarmonyCase(c, { runner });
    assert.equal(blocked.failure?.code, "PAGE_NOT_CONFIRMED");
    assert.equal(calls.some(args => args.includes("screenCap")), false);
    const result = await verifyHarmonyCase(c, { runner, pageReady: true });
    assert.equal(result.status, "passed");
    assert.equal(result.capture?.navigation, navigation);
    assert.equal(result.capture?.readiness.stableSamples, 2);
    assert.equal(calls.filter(args => args.includes("screenCap")).length, 2);
    assert.ok(calls.some(args => args.includes("rm")));
  }
});

test("configured navigation launches explicitly and screenshot errors never pass", async t => {
  const { directory } = await fixture(t);
  const c = normalizeVisualCase({ ...base, harmony: { navigation: "configured", bundleName: "com.example.app", abilityName: "EntryAbility", sampleIntervalMs: 50, timeoutMs: 150 } }, path.join(directory, "case.json"));
  const calls: string[][] = [];
  const success = await verifyHarmonyCase(c, { runner: fakeDevice(PNG.sync.write(png()), calls, { cleanupFail: true }) });
  assert.equal(success.status, "passed");
  assert.ok(calls.some(args => args.includes("aa")));
  assert.ok(success.capture?.warnings.length);
  const corrupt = await verifyHarmonyCase(c, { runner: fakeDevice(PNG.sync.write(png()), [], { corrupt: true }) });
  assert.equal(corrupt.failure?.stage, "capture");
  const unstable = await verifyHarmonyCase(c, { runner: fakeDevice(PNG.sync.write(png()), [], { changing: true }) });
  assert.equal(unstable.failure?.code, "UNSTABLE_SCREEN");
  assert.ok(unstable.artifacts.raw);
});

test("device disconnection is not silently replaced by an imported screenshot", async t => {
  const { directory } = await fixture(t);
  const c = normalizeVisualCase(base, path.join(directory, "case.json"));
  const result = await verifyHarmonyCase(c, { pageReady: true, runner: async () => { throw new Error("device disconnected"); } });
  assert.equal(result.failure?.stage, "device");
  assert.equal(result.status, "failed");
  assert.equal(result.capture, undefined);
  const unsupported = await verifyHarmonyCase(c, { changedOnly: true });
  assert.equal(unsupported.failure?.code, "UNSUPPORTED_OPTION");
});

test("a silent second screenshot failure cannot reuse the first device frame", async t => {
  const { directory } = await fixture(t);
  const c = normalizeVisualCase({ ...base, harmony: { sampleIntervalMs: 50 } }, path.join(directory, "case.json"));
  let remote: Buffer | undefined;
  let frames = 0;
  const delegate = fakeDevice(PNG.sync.write(png()), []);
  const runner: HdcRunner = async args => {
    if (args.includes("rm")) { remote = undefined; return ""; }
    if (args.includes("screenCap")) { if (++frames === 1) remote = PNG.sync.write(png()); return ""; }
    if (args.includes("recv")) {
      if (!remote) throw new Error("remote file missing");
      await fs.writeFile(args.at(-1)!, remote); return "";
    }
    return delegate(args);
  };
  const report = await verifyHarmonyCase(c, { runner, pageReady: true });
  assert.equal(report.status, "failed");
  assert.equal(report.failure?.stage, "capture");
  assert.match(report.failure!.message, /remote file missing/);
});

test("import region compares only explicitly configured content and preserves raw evidence", async t => {
  const { directory } = await fixture(t);
  await fs.writeFile(path.join(directory, "import.png"), PNG.sync.write(png(16, 20)));
  const c = normalizeVisualCase({ ...base, harmony: { screenshot: "import.png", capture: { scope: "region", region: { x: 2, y: 3, width: 12, height: 12 } } } }, path.join(directory, "case.json"));
  const report = await verifyHarmonyCase(c);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.capture?.rawSize, { width: 16, height: 20 });
  assert.deepEqual(report.capture?.crop, { x: 2, y: 3, width: 12, height: 12 });
  assert.deepEqual(await fs.readFile(report.artifacts.raw!), await fs.readFile(path.join(directory, "import.png")));
});

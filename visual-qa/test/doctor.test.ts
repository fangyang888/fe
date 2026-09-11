import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctor } from "../src/doctor.js";

async function workspace(t: any): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vqa-doctor-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("doctor validates a Web case and launches its browser channel", async t => {
  const directory = await workspace(t);
  await fs.writeFile(path.join(directory, "design.png"), "png");
  const casePath = path.join(directory, "case.json");
  await fs.writeFile(
    casePath,
    JSON.stringify({
      name: "home",
      designImage: "design.png",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
      browserChannel: "msedge",
    }),
  );
  const launched: string[] = [];
  let closed = false;
  const report = await runDoctor(
    { casePath },
    {
      launchBrowser: async channel => {
        launched.push(channel!);
        return { close: async () => { closed = true; } };
      },
    },
  );

  assert.equal(report.status, "ready");
  assert.deepEqual(launched, ["msedge"]);
  assert.equal(closed, true);
  assert.equal(report.checks.find(check => check.name === "design-image")?.status, "passed");
});

test("doctor reports a missing design without hiding other checks", async t => {
  const directory = await workspace(t);
  const casePath = path.join(directory, "case.json");
  await fs.writeFile(
    casePath,
    JSON.stringify({
      name: "missing-design",
      designImage: "missing.png",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
    }),
  );
  const report = await runDoctor(
    { casePath, skipBrowserLaunch: true },
  );

  assert.equal(report.status, "blocked");
  assert.equal(report.checks.find(check => check.name === "design-image")?.status, "failed");
  assert.equal(report.checks.find(check => check.name === "browser")?.status, "warning");
});

test("doctor keeps browser failures concise", async () => {
  const report = await runDoctor(
    {},
    {
      launchBrowser: async () => {
        throw new Error("browserType.launch: Failed to launch\nCall log:\n  - EPERM: operation not permitted");
      },
    },
  );
  const browser = report.checks.find(check => check.name === "browser");
  assert.equal(report.status, "blocked");
  assert.equal(browser?.message, "browserType.launch: Failed to launch");
  assert.doesNotMatch(browser?.message ?? "", /Call log/);
});

test("doctor skips HDC for an imported Harmony screenshot", async t => {
  const directory = await workspace(t);
  await fs.writeFile(path.join(directory, "design.png"), "png");
  await fs.writeFile(path.join(directory, "actual.png"), "png");
  const casePath = path.join(directory, "harmony.json");
  await fs.writeFile(
    casePath,
    JSON.stringify({
      platform: "harmony",
      name: "native",
      designImage: "design.png",
      harmony: { screenshot: "actual.png" },
    }),
  );
  let detected = false;
  const report = await runDoctor(
    { casePath },
    { detectDevices: async () => { detected = true; return []; } },
  );

  assert.equal(report.status, "ready");
  assert.equal(detected, false);
  assert.match(report.checks.find(check => check.name === "hdc")!.message, /not required/);
});

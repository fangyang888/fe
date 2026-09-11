import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PNG } from "pngjs";
import type { Browser } from "playwright";
import type { VerificationReport } from "../src/types.js";
import {
  readVisualSuite,
  runVisualSuite,
  SuiteBrowserPool,
  suiteReportToHtml,
  suiteReportToJunit,
} from "../src/suite.js";

async function workspace(t: any): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vqa-suite-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function fakeReport(
  name: string,
  status: "passed" | "failed",
  reportPath: string,
): VerificationReport {
  return {
    name,
    status,
    artifacts: { report: reportPath },
    comparison: {
      mismatchPercent: status === "passed" ? 0 : 12.5,
      ssim: status === "passed" ? 1 : 0.75,
    },
  } as unknown as VerificationReport;
}

function solidPng(): Buffer {
  const image = new PNG({ width: 12, height: 12 });
  image.data.fill(255);
  return PNG.sync.write(image);
}

test("reuses one browser per channel and closes pooled browsers", async () => {
  const launches: string[] = [];
  let closes = 0;
  const pool = new SuiteBrowserPool(async channel => {
    launches.push(channel ?? "chrome");
    return {
      close: async () => {
        closes += 1;
      },
    } as unknown as Browser;
  });

  const [first, second, edge] = await Promise.all([
    pool.acquire("chrome"),
    pool.acquire("chrome"),
    pool.acquire("msedge"),
  ]);

  assert.equal(first, second);
  assert.notEqual(first, edge);
  assert.deepEqual(launches, ["chrome", "msedge"]);
  await pool.close();
  assert.equal(closes, 2);
});

test("normalizes suite paths and verification defaults", async t => {
  const directory = await workspace(t);
  const suitePath = path.join(directory, "visual-suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({
      schemaVersion: 1,
      name: "smoke",
      concurrency: 2,
      defaults: { mode: "agent", projectRoot: "../app" },
      cases: [
        "cases/home.json",
        { case: "cases/profile.json", label: "profile", options: { mode: "final" } },
      ],
    }),
  );

  const suite = await readVisualSuite(suitePath);
  assert.equal(suite.name, "smoke");
  assert.equal(suite.concurrency, 2);
  assert.equal(suite.defaults.mode, "agent");
  assert.equal(suite.defaults.projectRoot, path.resolve(directory, "../app"));
  assert.equal(suite.cases[0]?.casePath, path.join(directory, "cases/home.json"));
  assert.equal(suite.cases[1]?.label, "profile");
  assert.equal(suite.cases[1]?.options.mode, "final");
});

test("runs a suite and writes JSON, JUnit, and HTML summaries", async t => {
  const directory = await workspace(t);
  const suitePath = path.join(directory, "suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({ name: "regression", cases: ["pass.json", "fail.json"] }),
  );

  const report = await runVisualSuite(suitePath, {
    runCase: async casePath =>
      fakeReport(
        path.basename(casePath, ".json"),
        casePath.endsWith("pass.json") ? "passed" : "failed",
        `${casePath}.report.json`,
      ),
  });

  assert.equal(report.status, "failed");
  assert.deepEqual(report.summary, {
    total: 2,
    passed: 1,
    failed: 1,
    errors: 0,
    skipped: 0,
  });
  assert.equal(JSON.parse(await fs.readFile(report.artifacts.report, "utf8")).name, "regression");
  const junit = await fs.readFile(report.artifacts.junit, "utf8");
  assert.match(junit, /tests="2" failures="1"/);
  assert.match(junit, /<failure message="Visual mismatch 12\.5000%"/);
  assert.equal(suiteReportToJunit(report), junit);
  const html = await fs.readFile(report.artifacts.html, "utf8");
  assert.match(html, /<!doctype html>/);
  assert.match(html, /regression/);
  assert.match(html, /href="\.\.\/\.\.\/pass\.json\.report\.json"/);
  assert.equal(suiteReportToHtml(report), html);
});

test("HTML summary escapes case names and messages", async t => {
  const directory = await workspace(t);
  const suitePath = path.join(directory, "suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({ name: "safe <suite>", cases: [{ case: "page.json", label: "<script>" }] }),
  );
  const report = await runVisualSuite(suitePath, {
    runCase: async casePath => ({
      ...fakeReport("page", "failed", `${casePath}.report.json`),
      failure: { message: "Unsafe <img src=x onerror=alert(1)>" },
    } as VerificationReport),
  });
  const html = await fs.readFile(report.artifacts.html, "utf8");
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /safe &lt;suite&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Unsafe &lt;img src=x onerror=alert\(1\)&gt;/);
});

test("fail-fast records remaining cases as skipped", async t => {
  const directory = await workspace(t);
  const suitePath = path.join(directory, "suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({
      name: "fail-fast",
      failFast: true,
      cases: ["first.json", "second.json", "third.json"],
    }),
  );
  let runs = 0;
  const report = await runVisualSuite(suitePath, {
    runCase: async casePath => {
      runs += 1;
      return fakeReport(path.basename(casePath), "failed", `${casePath}.report.json`);
    },
  });

  assert.equal(runs, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.skipped, 2);
  assert.deepEqual(
    report.cases.map(result => result.status),
    ["failed", "skipped", "skipped"],
  );
});

test("rejects unsafe suite concurrency and unknown options", async t => {
  const directory = await workspace(t);
  const suitePath = path.join(directory, "suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({
      name: "invalid",
      concurrency: 9,
      cases: [{ case: "page.json", options: { cachePath: "shared.json" } }],
    }),
  );
  await assert.rejects(readVisualSuite(suitePath), /concurrency must not exceed 8/);

  await fs.writeFile(
    suitePath,
    JSON.stringify({
      name: "invalid",
      cases: [{ case: "page.json", options: { cachePath: "shared.json" } }],
    }),
  );
  await assert.rejects(readVisualSuite(suitePath), /cachePath is not supported/);
});

test("suite command runs imported Harmony cases without a browser", async t => {
  const directory = await workspace(t);
  await fs.writeFile(path.join(directory, "design.png"), solidPng());
  await fs.writeFile(path.join(directory, "actual.png"), solidPng());
  for (const name of ["first", "second"]) {
    await fs.writeFile(
      path.join(directory, `${name}.json`),
      JSON.stringify({
        platform: "harmony",
        name,
        designImage: "design.png",
        outputDir: `artifacts/${name}`,
        harmony: { screenshot: "actual.png" },
      }),
    );
  }
  const suitePath = path.join(directory, "suite.json");
  await fs.writeFile(
    suitePath,
    JSON.stringify({ name: "native-suite", cases: ["first.json", "second.json"] }),
  );

  const { stdout } = await promisify(execFile)(process.execPath, [
    path.resolve("dist/src/cli.js"),
    "suite",
    "--suite",
    suitePath,
    "--compact",
  ]).catch(async (error: any) => {
    const report = await fs.readFile(
      path.join(directory, "artifacts/native-suite/suite-report.json"),
      "utf8",
    ).catch(() => "missing suite report");
    throw new Error(`suite CLI failed\nstdout:\n${error.stdout}\nstderr:\n${error.stderr}\nreport:\n${report}`);
  });
  const summary = JSON.parse(stdout);
  assert.equal(summary.status, "passed");
  assert.equal(summary.summary.passed, 2);
  assert.equal(await fs.stat(path.join(directory, "artifacts/native-suite/junit.xml")).then(value => value.isFile()), true);
  assert.equal(await fs.stat(path.join(directory, "artifacts/native-suite/index.html")).then(value => value.isFile()), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { evaluateMeasurements, measurementDelta, normalizeContract, recordMeasurement, summarizeMeasurement } from "../src/measure.js";
import type { MeasurementResult } from "../src/types.js";

const contract = normalizeContract({ tolerance: 1, elements: [
  { name: "card", selector: "#card", bounds: { width: 300 }, styles: { "font-size": 16, color: "rgb(255, 0, 0)" } },
  { name: "button", selector: "#button", relations: [{ target: "card", metric: "gapY", expected: 16 }, { target: "card", metric: "centerX", expected: 0 }] },
] });
function measurements(offset = 0): MeasurementResult["measurements"] {
  return [
    { name: "card", count: 1, visible: true, bounds: { x: 20, y: 20, width: 300, height: 100 }, styles: { "font-size": "16px", color: "rgb(255, 0, 0)" } },
    { name: "button", count: 1, visible: true, bounds: { x: 70, y: 136 + offset, width: 200, height: 40 }, styles: {} },
  ];
}
const result = (offset: number) => evaluateMeasurements(contract, measurements(offset));

test("checks relative spacing and CSS pixels with inclusive tolerance", () => {
  assert.equal(result(1).passed, true);
  const failed = result(8);
  assert.equal(failed.issues.length, 1);
  assert.equal(failed.issues[0]?.actual, 24);
  assert.equal(failed.issues[0]?.delta, 8);
  const shifted = measurements();
  for (const item of shifted) { item.bounds!.x += 30; item.bounds!.y += 50; }
  assert.equal(evaluateMeasurements(contract, shifted).passed, true);
});

test("missing, duplicate, hidden targets fail instead of silently passing", () => {
  for (const variant of [{ count: 0 }, { count: 2 }, { visible: false }]) {
    const values = measurements();
    Object.assign(values[0]!, variant);
    const failed = evaluateMeasurements(contract, values);
    assert.equal(failed.passed, false);
    assert.ok(failed.issues.some((issue) => issue.actual === "target unavailable"));
  }
});

test("does not interpret non-pixel CSS values as pixel measurements", () => {
  const values = measurements();
  values[0]!.styles["font-size"] = "1rem";
  assert.equal(evaluateMeasurements(contract, values).passed, false);
});

test("validates contract names, relations, finite bounds and tolerances", () => {
  assert.throws(() => normalizeContract({ elements: [] }));
  assert.throws(() => normalizeContract({ ...contract, tolerance: -1 }));
  assert.throws(() => normalizeContract({ elements: [contract.elements[0]!, contract.elements[0]!] }));
  assert.throws(() => normalizeContract({ elements: [{ name: "a", selector: "#a", bounds: { x: NaN } }] }));
  assert.throws(() => normalizeContract({ elements: [contract.elements[1]!] }));
});

test("tracks improvement, regression, resolution and two stagnant rounds", () => {
  const first = result(8);
  first.iteration = measurementDelta(first);
  assert.equal(first.iteration.baseline, true);
  assert.equal(measurementDelta(result(4), first).improved.length, 1);
  assert.equal(measurementDelta(result(12), first).worsened.length, 1);
  assert.equal(measurementDelta(result(0), first).resolved.length, 1);
  const second = result(8);
  second.iteration = measurementDelta(second, first);
  assert.equal(second.iteration.recommendImageReview, false);
  const third = measurementDelta(result(8), second);
  assert.equal(third.stagnantRounds, 2);
  assert.equal(third.recommendImageReview, true);
});

test("history survives runs and resets when contract or viewport identity changes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-measure-"));
  const file = path.join(directory, "history.json");
  try {
    await recordMeasurement(result(8), file, { viewport: 375, contract });
    const next = result(4);
    await recordMeasurement(next, file, { viewport: 375, contract });
    assert.equal(next.iteration?.improved.length, 1);
    const resized = result(4);
    await recordMeasurement(resized, file, { viewport: 400, contract });
    assert.equal(resized.iteration?.baseline, true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("bounds stdout and prioritizes newly introduced issues", () => {
  const value = result(8);
  value.issues = Array.from({ length: 20 }, (_, i) => ({ ...value.issues[0]!, id: String(i) }));
  value.iteration = measurementDelta(value, { ...value, issues: value.issues.slice(0, 19) });
  const summary = summarizeMeasurement(value)!;
  assert.equal(summary.issues.length, 8);
  assert.equal(summary.omittedIssues, 12);
  assert.equal(summary.issues[0]?.id, "19");
});

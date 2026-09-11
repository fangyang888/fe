import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAdaptiveWorkflow,
  resolveAdaptiveMode,
} from "../src/adaptive.js";
import type { VerificationReport } from "../src/types.js";

function report(
  mode: VerificationReport["mode"],
  status: VerificationReport["status"],
  mismatchPercent: number,
  designHash = "design-a",
): VerificationReport {
  return {
    schemaVersion: 1,
    mode,
    status,
    comparison: { mismatchPercent },
    cache: { designHash },
    artifacts: {},
  } as unknown as VerificationReport;
}

test("adaptive mode starts with diagnostics and resets when the design changes", () => {
  assert.equal(resolveAdaptiveMode(undefined, "design-a"), "agent");
  const previous = report("quick", "failed", 2);
  previous.workflow = createAdaptiveWorkflow(undefined, previous);
  assert.equal(resolveAdaptiveMode(previous, "design-b"), "agent");
});

test("adaptive mode iterates locally and promotes candidates to final", () => {
  const diagnostic = report("agent", "failed", 2);
  diagnostic.workflow = createAdaptiveWorkflow(undefined, diagnostic);
  assert.equal(resolveAdaptiveMode(diagnostic, "design-a"), "quick");

  const completed = report("final", "passed", 1);
  completed.workflow = createAdaptiveWorkflow(diagnostic, completed, {
    autoFinalized: true,
    candidateMismatchPercent: 0.9,
  });
  assert.equal(resolveAdaptiveMode(completed, "design-a"), "final");
  assert.equal(completed.workflow.nextAction, "complete");
  assert.equal(completed.workflow.autoFinalized, true);
});

test("adaptive workflow can request crops on the first failed local round", () => {
  const first = report("quick", "failed", 2);
  const workflow = createAdaptiveWorkflow(undefined, first, {
    hasDiagnosticCrops: true,
  });
  assert.equal(workflow.pixelStagnantRounds, 0);
  assert.equal(workflow.nextAction, "inspect-diagnostic-crops");

  const improved = report("quick", "failed", 1.8);
  assert.equal(
    createAdaptiveWorkflow(first, improved).pixelStagnantRounds,
    0,
  );
});

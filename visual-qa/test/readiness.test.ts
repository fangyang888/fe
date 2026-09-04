import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { waitForVisualReadiness } from "../src/readiness.js";

function readinessPage(calls: {
  networkIdle: number;
  readyExpression: number;
  timeouts: number[];
}): Page {
  let evaluation = 0;
  return {
    waitForLoadState: async () => {
      calls.networkIdle += 1;
    },
    locator: () => ({
      waitFor: async ({ timeout }: { timeout: number }) => {
        calls.timeouts.push(timeout);
        await new Promise((resolve) => setTimeout(resolve, 15));
      },
    }),
    waitForFunction: async (_expression: string, _argument: unknown, options: { timeout: number }) => {
      calls.readyExpression += 1;
      calls.timeouts.push(options.timeout);
    },
    evaluate: async () => {
      evaluation += 1;
      if (evaluation === 1) return true;
      if (evaluation === 2) return { total: 0, failed: [] };
      return true;
    },
  } as unknown as Page;
}

test("uses one deadline and skips network idle when a ready expression exists", async () => {
  const calls = { networkIdle: 0, readyExpression: 0, timeouts: [] as number[] };
  const result = await waitForVisualReadiness(readinessPage(calls), {
    selector: "#app",
    readyExpression: "window.__READY__ === true",
    networkIdle: true,
    timeoutMs: 200,
    stableFrames: 1,
  });

  assert.equal(calls.networkIdle, 0);
  assert.equal(calls.readyExpression, 1);
  assert.equal(result.timings.networkIdleSkipped, true);
  assert.ok(calls.timeouts[1]! < calls.timeouts[0]!);
  assert.ok(result.timings.totalMs >= 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVariants, eligibleForRanking } from "../src/variants.js";
import type { VerificationReport } from "../src/types.js";

test("variants validate bounded candidates and reserve baseline", () => {
  assert.equal(parseVariants([{ name: " a ", css: ".a { top: 1px }" }])[0]?.name, "a");
  for (const value of [[], null, [{ name: "baseline", css: "x" }],
    [{ name: "a", css: "" }], [{ name: "a", css: "x" }, { name: "a", css: "y" }],
    Array.from({ length: 33 }, (_, i) => ({ name: String(i), css: "x" }))]) {
    assert.throws(() => parseVariants(value));
  }
});

test("ranking excludes broken structure, CSS, measurements and readiness", () => {
  const capture = { readiness: { fontsReady: true, layoutStable: true, imagesFailed: [] }, consoleErrors: [] };
  assert.equal(eligibleForRanking({ capture } as unknown as VerificationReport), true);
  for (const invalid of [
    { structure: { passed: false } }, { cssRules: { passed: false } },
    { measurement: { passed: false } }, { consoleErrors: ["error"] },
    { readiness: { ...capture.readiness, fontsReady: false } },
    { readiness: { ...capture.readiness, imagesFailed: ["image"] } },
    { readiness: { ...capture.readiness, layoutStable: false } },
  ]) assert.equal(eligibleForRanking({ capture: { ...capture, ...invalid } } as unknown as VerificationReport), false);
});

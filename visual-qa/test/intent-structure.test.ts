import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeIntentStructure,
  structureFromIntentPlan,
} from "../src/intent-structure.js";
import type { IntentPlan } from "../src/types.js";

function plan(selector?: string): IntentPlan {
  return {
    schemaVersion: 1,
    kind: "visual-qa-intent-plan",
    name: "opaque-card",
    generatedAt: "2026-09-10T00:00:00.000Z",
    status: "ready",
    source: { provider: "pixso", nodeId: "138:97029" },
    regions: [
      {
        id: "item-1",
        order: 1,
        name: "annual-card",
        mode: "single-image",
        source: "item-id",
        nodeId: "138:97117",
        ...(selector ? { selector } : {}),
        borderWidth: 0,
        confidence: 1,
      },
    ],
    ambiguities: [],
  };
}

test("derives a no-children structure guard from an opaque image intent", () => {
  assert.deepEqual(structureFromIntentPlan(plan("#annual-card")), {
    failOnMismatch: true,
    regions: [
      {
        name: "annual-card",
        type: "single-image",
        selector: "#annual-card",
        requireNoVisibleChildren: true,
      },
    ],
  });
});

test("refuses verification when an opaque image has no selector guard", () => {
  assert.throws(
    () => structureFromIntentPlan(plan()),
    /Opaque image regions require selectors.*annual-card/,
  );
});

test("refuses a hand-written structure rule that weakens opaque image intent", () => {
  const derived = structureFromIntentPlan(plan("#annual-card"));
  assert.throws(
    () =>
      mergeIntentStructure(
        {
          failOnMismatch: true,
          regions: [
            {
              name: "annual-card",
              type: "single-image",
              selector: "#annual-card",
              requireNoVisibleChildren: false,
            },
          ],
        },
        derived,
      ),
    /remain one opaque image/,
  );
});

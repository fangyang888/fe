import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { searchComponentsHybrid } from "../src/hybrid-search.js";
import { buildComponentIndex } from "../src/scanner.js";

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/project");

test("returns a semantic-only component when query words do not overlap", async () => {
  const index = await buildComponentIndex({ projectRoot: fixtureRoot });
  const target = index.components.find(
    (component) => component.name === "UserSelectModal",
  );
  assert.ok(target);

  const result = searchComponentsHybrid(
    index,
    "用于审批流程里挑选负责人的控件",
    [{ id: target.id, vectorScore: 0.92 }],
    { limit: 3 },
  );

  assert.equal(result.searchMode, "hybrid");
  assert.equal(result.results[0]?.name, "UserSelectModal");
  assert.match(result.results[0]?.matchReason.join(" ") ?? "", /语义相似度/);
});

test("keeps an exact keyword match ahead of a semantic-only candidate", async () => {
  const index = await buildComponentIndex({ projectRoot: fixtureRoot });
  const phoneInput = index.components.find(
    (component) => component.name === "PhoneInput",
  );
  const userSelect = index.components.find(
    (component) => component.name === "UserSelectModal",
  );
  assert.ok(phoneInput);
  assert.ok(userSelect);

  const result = searchComponentsHybrid(index, "PhoneInput", [
    { id: userSelect.id, vectorScore: 1 },
    { id: phoneInput.id, vectorScore: 0.7 },
  ]);

  assert.equal(result.results[0]?.name, "PhoneInput");
});

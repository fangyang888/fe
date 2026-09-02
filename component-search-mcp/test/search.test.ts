import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { buildComponentIndex } from "../src/scanner.js";
import { searchComponents } from "../src/search.js";

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/project");

test("indexes exported project components and usage locations", async () => {
  const index = await buildComponentIndex({ projectRoot: fixtureRoot });
  const component = index.components.find(
    (candidate) => candidate.name === "UserSelectModal",
  );

  assert.ok(component);
  assert.equal(component.projectName, "component-search-fixture");
  assert.equal(component.usageCount, 1);
  assert.deepEqual(component.usedBy, ["src/pages/MemberPage.tsx"]);
  assert.equal(component.props[0]?.name, "multiple");
  assert.equal(component.parser, "typescript-ast");
  assert.deepEqual(component.hooks, ["useMemo"]);
  assert.deepEqual(component.renderedElements, ["div", "input", "button"]);
  assert.match(component.embeddingText, /Props: multiple\?: boolean/);
});

test("finds an English-named component from a Chinese requirement", async () => {
  const index = await buildComponentIndex({ projectRoot: fixtureRoot });
  const result = searchComponents(index, "支持远程搜索和多选的人员选择组件");

  assert.equal(result.results[0]?.name, "UserSelectModal");
  assert.ok(result.results[0]?.score > 0);
});

test("finds a phone input from a Chinese natural-language question", async () => {
  const index = await buildComponentIndex({ projectRoot: fixtureRoot });
  const result = searchComponents(index, "项目里有没有手机号输入组件？", { limit: 3 });

  assert.equal(result.results[0]?.name, "PhoneInput");
  assert.ok(result.results[0]?.matchScore > 0.8);
  assert.ok(result.results[0]?.matchScore <= 1);
});

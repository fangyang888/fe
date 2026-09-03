import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractArktsComponents } from "../src/extractors/arkts.js";

const fixturePath = path.resolve(
  process.cwd(),
  "test/fixtures/harmony-project/feature/profile/src/main/ets/components/UserProfileCard.ets",
);

test("extracts ArkUI component metadata from ArkTS", async () => {
  const content = await fs.readFile(fixturePath, "utf8");
  const [component] = extractArktsComponents(fixturePath, content);

  assert.ok(component);
  assert.equal(component.name, "UserProfileCard");
  assert.equal(component.framework, "arkui");
  assert.equal(component.parser, "arkts-ast");
  assert.match(component.description, /用户资料卡片/);
  assert.deepEqual(component.useCases, ["个人主页和成员列表中的用户信息展示"]);
  assert.deepEqual(component.props, [
    { name: "userId", type: "string", required: true },
    { name: "avatar", type: "ResourceStr", required: false },
  ]);
  assert.deepEqual(component.hooks, ["@State expanded"]);
  assert.deepEqual(component.renderedElements, ["Column", "Avatar", "Image", "Text"]);
  assert.match(component.sourceSnippet, /export struct UserProfileCard/);
});

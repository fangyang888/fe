import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { resolveRequestedProjectRoot } from "../src/config.js";
import {
  discoverSourceRoots,
  normalizeSourceRoots,
} from "../src/source-roots.js";

const fixturesRoot = path.resolve(process.cwd(), "test/fixtures");

test("discovers src in a regular frontend project", async () => {
  const roots = await discoverSourceRoots(path.join(fixturesRoot, "project"));

  assert.deepEqual(roots, ["src"]);
});

test("discovers app and package source roots in a workspace", async () => {
  const roots = await discoverSourceRoots(path.join(fixturesRoot, "monorepo"));

  assert.deepEqual(roots, ["apps/admin/src", "packages/ui/src"]);
});

test("rejects source roots outside the selected project", () => {
  const projectRoot = path.join(fixturesRoot, "project");

  assert.throws(
    () => normalizeSourceRoots(projectRoot, ["../monorepo"]),
    /outside the project root/,
  );
});

test("allows project selection only within configured roots", () => {
  const defaultProject = path.join(fixturesRoot, "project");
  const allowedRoot = fixturesRoot;

  assert.equal(
    resolveRequestedProjectRoot("../monorepo", defaultProject, [allowedRoot]),
    path.join(fixturesRoot, "monorepo"),
  );
  assert.throws(
    () => resolveRequestedProjectRoot("../../outside", defaultProject, [allowedRoot]),
    /outside COMPONENT_MCP_ALLOWED_ROOTS/,
  );
});

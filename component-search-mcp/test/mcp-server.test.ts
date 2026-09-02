import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const fixturesRoot = path.resolve(process.cwd(), "test/fixtures");

test("searches an explicitly selected project with auto-discovered roots", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "component-search-mcp-test-"),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(process.cwd(), "dist/src/server.js")],
    cwd: path.join(fixturesRoot, "project"),
    env: {
      ...getDefaultEnvironment(),
      COMPONENT_MCP_PROJECT_ROOT: path.join(fixturesRoot, "project"),
      COMPONENT_MCP_ALLOWED_ROOTS: fixturesRoot,
      COMPONENT_MCP_INDEX_PATH: path.join(temporaryDirectory, "default-index.json"),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "component-search-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "search_internal_component",
      arguments: {
        query: "GridMenu",
        projectRoot: path.join(fixturesRoot, "monorepo"),
      },
    });
    const structuredContent = result.structuredContent as {
      projectName: string;
      sourceRoots: string[];
      results: Array<{ name: string }>;
    };

    assert.equal(structuredContent.projectName, "component-search-monorepo-fixture");
    assert.deepEqual(structuredContent.sourceRoots, [
      "apps/admin/src",
      "packages/ui/src",
    ]);
    assert.equal(structuredContent.results[0]?.name, "GridMenu");
  } finally {
    await client.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("refreshes the index lazily when a project file is added", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "component-search-mcp-lazy-refresh-"),
  );
  const projectRoot = path.join(temporaryDirectory, "project");
  await cp(path.join(fixturesRoot, "project"), projectRoot, { recursive: true });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(process.cwd(), "dist/src/server.js")],
    cwd: projectRoot,
    env: {
      ...getDefaultEnvironment(),
      COMPONENT_MCP_PROJECT_ROOT: projectRoot,
      COMPONENT_MCP_INDEX_PATH: path.join(temporaryDirectory, "index.json"),
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "lazy-refresh-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const before = await client.callTool({
      name: "search_internal_component",
      arguments: { query: "LazyGrid" },
    });
    const beforeContent = before.structuredContent as {
      results: Array<{ name: string }>;
    };
    assert.equal(
      beforeContent.results.some((component) => component.name === "LazyGrid"),
      false,
    );

    await writeFile(
      path.join(projectRoot, "src/components/LazyGrid.tsx"),
      [
        "/** 九宫格入口组件。 */",
        "export function LazyGrid() {",
        "  return <nav />;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const after = await client.callTool({
      name: "search_internal_component",
      arguments: { query: "LazyGrid" },
    });
    const afterContent = after.structuredContent as {
      results: Array<{ name: string }>;
    };
    assert.equal(afterContent.results[0]?.name, "LazyGrid");
  } finally {
    await client.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

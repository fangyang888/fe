import assert from "node:assert/strict";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const fixturesRoot = path.resolve(process.cwd(), "test/fixtures");

test("starts through an npm-style symlinked executable", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "component-search-mcp-bin-test-"),
  );
  const linkedEntry = path.join(temporaryDirectory, "internal-component-search-mcp");
  await symlink(path.resolve(process.cwd(), "dist/src/server.js"), linkedEntry);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [linkedEntry],
    env: {
      ...getDefaultEnvironment(),
      COMPONENT_MCP_PROJECT_ROOT: path.join(fixturesRoot, "project"),
      COMPONENT_MCP_INDEX_PATH: path.join(temporaryDirectory, "index.json"),
      COMPONENT_MCP_SEARCH_MODE: "keyword",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "symlinked-bin-test", version: "0.1.1" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools[0]?.name, "search_internal_component");
  } finally {
    await client.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

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
      COMPONENT_MCP_SEARCH_MODE: "keyword",
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
      results: Array<{
        name: string;
        componentPath: string;
        relativePath: string;
        displayPathMarkdown: string;
        sourcePath: string;
        matchScore?: number;
        matchReason?: string[];
      }>;
    };

    assert.equal(structuredContent.projectName, "component-search-monorepo-fixture");
    assert.deepEqual(structuredContent.sourceRoots, [
      "apps/admin/src",
      "packages/ui/src",
    ]);
    assert.equal(structuredContent.results[0]?.name, "GridMenu");
    assert.equal(
      structuredContent.results[0]?.componentPath,
      path.join(fixturesRoot, "monorepo/packages/ui/src/GridMenu.vue"),
    );
    assert.equal(
      structuredContent.results[0]?.sourcePath,
      "packages/ui/src/GridMenu.vue",
    );
    assert.equal(
      structuredContent.results[0]?.relativePath,
      "/ui/src/GridMenu.vue",
    );
    assert.equal(
      structuredContent.results[0]?.displayPathMarkdown,
      `[/ui/src/GridMenu.vue](<${path.join(fixturesRoot, "monorepo/packages/ui/src/GridMenu.vue")}>)`,
    );
    assert.equal(structuredContent.results[0]?.matchScore, undefined);
    assert.equal(structuredContent.results[0]?.matchReason, undefined);
    const textContent = (
      result.content as Array<{ type: string; text?: string }>
    ).find((content) => content.type === "text");
    assert.equal(textContent?.type, "text");
    if (textContent?.type === "text" && textContent.text) {
      assert.match(
        textContent.text,
        /GridMenu.*使用次数：0 次/,
      );
      assert.match(
        textContent.text,
        /组件路径：\[\/ui\/src\/GridMenu\.vue\]\(<.*packages\/ui\/src\/GridMenu\.vue>\)/,
      );
      assert.doesNotMatch(textContent.text, /实际绝对路径：|相对路径：/);
    }
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
      COMPONENT_MCP_SEARCH_MODE: "keyword",
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

test("falls back to keyword search when the embedding provider is unavailable", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "component-search-mcp-fallback-"),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(process.cwd(), "dist/src/server.js")],
    cwd: path.join(fixturesRoot, "project"),
    env: {
      ...getDefaultEnvironment(),
      COMPONENT_MCP_PROJECT_ROOT: path.join(fixturesRoot, "project"),
      COMPONENT_MCP_INDEX_PATH: path.join(temporaryDirectory, "index.json"),
      COMPONENT_MCP_SEARCH_MODE: "hybrid",
      COMPONENT_MCP_EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "fallback-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "search_internal_component",
      arguments: { query: "手机号输入组件" },
    });
    const structuredContent = result.structuredContent as {
      searchMode: string;
      semanticWarning?: string;
      results: Array<{ name: string }>;
    };

    assert.equal(structuredContent.searchMode, "keyword-fallback");
    assert.match(structuredContent.semanticWarning ?? "", /OPENAI_API_KEY/);
    assert.equal(structuredContent.results[0]?.name, "PhoneInput");
  } finally {
    await client.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

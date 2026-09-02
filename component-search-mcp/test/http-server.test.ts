import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const fixturesRoot = path.resolve(process.cwd(), "test/fixtures");

test("serves component search over stateless Streamable HTTP", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "component-search-mcp-http-"),
  );
  const previousEnvironment = {
    projectRoot: process.env.COMPONENT_MCP_PROJECT_ROOT,
    allowedRoots: process.env.COMPONENT_MCP_ALLOWED_ROOTS,
    indexPath: process.env.COMPONENT_MCP_INDEX_PATH,
  };

  process.env.COMPONENT_MCP_PROJECT_ROOT = path.join(fixturesRoot, "project");
  process.env.COMPONENT_MCP_ALLOWED_ROOTS = fixturesRoot;
  process.env.COMPONENT_MCP_INDEX_PATH = path.join(
    temporaryDirectory,
    "index.json",
  );

  const { startComponentSearchHttpServer } = await import(
    "../src/http-server.js"
  );
  const runningServer = await startComponentSearchHttpServer({
    host: "127.0.0.1",
    port: 0,
  });
  const client = new Client({
    name: "component-search-http-test",
    version: "0.1.0",
  });

  try {
    const healthResponse = await fetch(
      `http://127.0.0.1:${runningServer.port}/healthz`,
    );
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { status: "ok" });

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${runningServer.port}/mcp`),
    );
    await client.connect(transport);

    const result = await client.callTool({
      name: "search_internal_component",
      arguments: { query: "PhoneInput" },
    });
    const structuredContent = result.structuredContent as {
      results: Array<{ name: string }>;
    };
    assert.equal(structuredContent.results[0]?.name, "PhoneInput");
  } finally {
    await client.close().catch(() => undefined);
    await runningServer.close();
    await rm(temporaryDirectory, { recursive: true, force: true });

    if (previousEnvironment.projectRoot === undefined) {
      delete process.env.COMPONENT_MCP_PROJECT_ROOT;
    } else {
      process.env.COMPONENT_MCP_PROJECT_ROOT = previousEnvironment.projectRoot;
    }
    if (previousEnvironment.allowedRoots === undefined) {
      delete process.env.COMPONENT_MCP_ALLOWED_ROOTS;
    } else {
      process.env.COMPONENT_MCP_ALLOWED_ROOTS = previousEnvironment.allowedRoots;
    }
    if (previousEnvironment.indexPath === undefined) {
      delete process.env.COMPONENT_MCP_INDEX_PATH;
    } else {
      process.env.COMPONENT_MCP_INDEX_PATH = previousEnvironment.indexPath;
    }
  }
});

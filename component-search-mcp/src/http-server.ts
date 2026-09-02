#!/usr/bin/env node

import { webcrypto } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveProjectRoot } from "./config.js";
import { createComponentSearchServer } from "./server.js";
import { resolveSourceRootsForProject } from "./source-roots.js";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

export interface ComponentSearchHttpServerOptions {
  host?: string;
  port?: number;
}

function jsonResponse(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3102 : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("COMPONENT_MCP_HTTP_PORT must be an integer from 0 to 65535");
  }
  return port;
}

export async function startComponentSearchHttpServer(
  options: ComponentSearchHttpServerOptions = {},
) {
  const projectRoot = resolveProjectRoot();
  await fs.access(projectRoot);
  const sourceRoots = await resolveSourceRootsForProject(projectRoot);
  const host = options.host ?? process.env.COMPONENT_MCP_HTTP_HOST ?? "0.0.0.0";
  const port =
    options.port ??
    parsePort(process.env.COMPONENT_MCP_HTTP_PORT ?? process.env.PORT);

  const httpServer = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");

    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname === "/healthz") {
      if (request.method !== "GET") {
        jsonResponse(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      jsonResponse(response, 200, { status: "ok" });
      return;
    }

    if (requestUrl.pathname !== "/mcp") {
      jsonResponse(response, 404, { error: "NOT_FOUND" });
      return;
    }

    if (request.method !== "POST") {
      jsonResponse(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const mcpServer = createComponentSearchServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("Component search MCP HTTP request failed:", error);
      if (!response.headersSent) {
        jsonResponse(response, 500, {
          error: "INTERNAL_SERVER_ERROR",
          jsonrpc: "2.0",
          id: null,
        });
      } else if (!response.writableEnded) {
        response.end();
      }
    } finally {
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
    }
  });

  httpServer.headersTimeout = 10_000;
  httpServer.requestTimeout = 120_000;
  httpServer.setTimeout(125_000);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    httpServer.close();
    throw new Error("Unable to determine the HTTP server address");
  }

  let closePromise: Promise<void> | undefined;
  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}/mcp`,
    close(): Promise<void> {
      closePromise ??= new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        httpServer.closeIdleConnections();
      });
      return closePromise;
    },
    projectRoot,
    sourceRoots,
  };
}

async function main(): Promise<void> {
  const runningServer = await startComponentSearchHttpServer();
  console.error(
    `Internal component search MCP HTTP server listening on ${runningServer.url} for ${runningServer.projectRoot} (${runningServer.sourceRoots.join(", ")})`,
  );

  const shutdown = async () => {
    await runningServer.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OllamaEmbeddingProvider,
  readOllamaEmbeddingConfig,
} from "../src/embeddings/ollama.js";
import {
  createEmbeddingProvider,
  readEmbeddingProviderName,
} from "../src/embeddings/factory.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("keeps a fixed Ollama profile for the explicit switch", () => {
  const config = readOllamaEmbeddingConfig({});

  assert.equal(config.model, "embeddinggemma:300m");
  assert.equal(config.dimensions, 768);
  assert.equal(config.baseUrl, "http://127.0.0.1:11434");
});

test("factory preserves Ollama as an explicit switch without an API key", () => {
  const provider = createEmbeddingProvider({
    COMPONENT_MCP_EMBEDDING_PROVIDER: "ollama",
    COMPONENT_MCP_EMBEDDING_MODEL: "embeddinggemma",
    COMPONENT_MCP_EMBEDDING_DIMENSIONS: "3",
  });

  assert.equal(provider.provider, "ollama");
  assert.equal(provider.model, "embeddinggemma");
  assert.equal(provider.dimensions, 3);
});

test("factory preserves the OpenAI provider as an explicit switch", () => {
  const provider = createEmbeddingProvider({
    COMPONENT_MCP_EMBEDDING_PROVIDER: "openai",
    OPENAI_API_KEY: "not-a-real-key",
    COMPONENT_MCP_EMBEDDING_MODEL: "text-embedding-3-small",
    COMPONENT_MCP_EMBEDDING_DIMENSIONS: "1536",
  });

  assert.equal(provider.provider, "openai");
  assert.equal(provider.model, "text-embedding-3-small");
  assert.equal(provider.dimensions, 1536);
});

test("batches Ollama embed requests with truncation disabled", async () => {
  const requestUrls: string[] = [];
  const requestBodies: Array<{
    model: string;
    input: string[];
    dimensions: number;
    truncate: boolean;
    keep_alive: string;
  }> = [];
  const fetchMock = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestUrls.push(String(input));
    const body = JSON.parse(String(init?.body)) as (typeof requestBodies)[number];
    requestBodies.push(body);
    return jsonResponse({
      model: body.model,
      embeddings: body.input.map((_text, index) => [requestBodies.length, index, 1]),
    });
  }) as typeof fetch;
  const provider = new OllamaEmbeddingProvider(
    {
      model: "embeddinggemma",
      dimensions: 3,
      batchSize: 2,
      maxRetries: 0,
    },
    { fetch: fetchMock },
  );

  const vectors = await provider.embedDocuments(["one", "two", "three"]);

  assert.deepEqual(vectors, [
    [1, 0, 1],
    [1, 1, 1],
    [2, 0, 1],
  ]);
  assert.deepEqual(
    requestBodies.map(({ input }) => input),
    [["one", "two"], ["three"]],
  );
  assert.equal(requestBodies[0]?.truncate, false);
  assert.equal(requestBodies[0]?.dimensions, 3);
  assert.equal(requestBodies[0]?.keep_alive, "5m");
  assert.deepEqual(requestUrls, [
    "http://127.0.0.1:11434/api/embed",
    "http://127.0.0.1:11434/api/embed",
  ]);
});

test("retries transient Ollama failures but not a missing model", async () => {
  let transientRequests = 0;
  const delays: number[] = [];
  const transientFetch = (async () => {
    transientRequests += 1;
    return transientRequests === 1
      ? jsonResponse({ error: "loading failed" }, 500)
      : jsonResponse({ embeddings: [[1, 0, 0]] });
  }) as typeof fetch;
  const provider = new OllamaEmbeddingProvider(
    { model: "embeddinggemma", dimensions: 3, maxRetries: 1 },
    {
      fetch: transientFetch,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    },
  );

  assert.deepEqual(await provider.embedQuery("query"), [1, 0, 0]);
  assert.equal(transientRequests, 2);
  assert.deepEqual(delays, [250]);

  let missingModelRequests = 0;
  const missingModelProvider = new OllamaEmbeddingProvider(
    { model: "missing", dimensions: 3, maxRetries: 2 },
    {
      fetch: (async () => {
        missingModelRequests += 1;
        return jsonResponse({ error: "model not found" }, 404);
      }) as typeof fetch,
      sleep: async () => undefined,
    },
  );

  await assert.rejects(
    missingModelProvider.embedQuery("query"),
    /failed \(404\)/,
  );
  assert.equal(missingModelRequests, 1);
});

test("rejects an Ollama vector with unexpected dimensions", async () => {
  const provider = new OllamaEmbeddingProvider(
    { model: "embeddinggemma", dimensions: 3, maxRetries: 0 },
    {
      fetch: (async () =>
        jsonResponse({ embeddings: [[1, 0]] })) as typeof fetch,
    },
  );

  await assert.rejects(
    provider.embedQuery("query"),
    /Embedding vector 0 dimensions differ: 2 !== 3/,
  );
});

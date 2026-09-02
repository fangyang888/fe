import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OpenAIEmbeddingProvider,
  readOpenAIEmbeddingConfig,
} from "../src/embeddings/openai.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("requires explicit embedding credentials, model, and dimensions", () => {
  assert.throws(() => readOpenAIEmbeddingConfig({}), /OPENAI_API_KEY is required/);
  assert.throws(
    () => readOpenAIEmbeddingConfig({ OPENAI_API_KEY: "test-key" }),
    /COMPONENT_MCP_EMBEDDING_MODEL is required/,
  );
  assert.throws(
    () =>
      readOpenAIEmbeddingConfig({
        OPENAI_API_KEY: "test-key",
        COMPONENT_MCP_EMBEDDING_MODEL: "test-model",
      }),
    /COMPONENT_MCP_EMBEDDING_DIMENSIONS must be a positive integer/,
  );
});

test("batches OpenAI embedding requests and restores response index order", async () => {
  const requestBodies: Array<{ input: string[]; model: string; dimensions: number }> = [];
  const fetchMock = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      input: string[];
      model: string;
      dimensions: number;
    };
    requestBodies.push(body);
    const data = body.input.map((_text, index) => ({
      index,
      embedding: [requestBodies.length, index],
    }));
    return jsonResponse({ data: data.reverse() });
  }) as typeof fetch;
  const provider = new OpenAIEmbeddingProvider(
    {
      apiKey: "not-a-real-key",
      model: "test-embedding-v1",
      dimensions: 2,
      batchSize: 2,
      maxRetries: 0,
    },
    { fetch: fetchMock },
  );

  const vectors = await provider.embedDocuments(["one", "two", "three"]);

  assert.deepEqual(vectors, [
    [1, 0],
    [1, 1],
    [2, 0],
  ]);
  assert.deepEqual(
    requestBodies.map(({ input }) => input),
    [["one", "two"], ["three"]],
  );
  assert.equal(requestBodies[0]?.model, "test-embedding-v1");
  assert.equal(requestBodies[0]?.dimensions, 2);
});

test("retries a rate-limited embedding request", async () => {
  let requestCount = 0;
  const delays: number[] = [];
  const fetchMock = (async () => {
    requestCount += 1;
    return requestCount === 1
      ? jsonResponse({ error: { message: "rate limited" } }, 429)
      : jsonResponse({ data: [{ index: 0, embedding: [1, 0] }] });
  }) as typeof fetch;
  const provider = new OpenAIEmbeddingProvider(
    {
      apiKey: "not-a-real-key",
      model: "test-embedding-v1",
      dimensions: 2,
      maxRetries: 1,
    },
    {
      fetch: fetchMock,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    },
  );

  assert.deepEqual(await provider.embedQuery("query"), [1, 0]);
  assert.equal(requestCount, 2);
  assert.deepEqual(delays, [250]);
});

test("does not retry an authentication failure", async () => {
  let requestCount = 0;
  const fetchMock = (async () => {
    requestCount += 1;
    return jsonResponse({ error: { message: "unauthorized" } }, 401);
  }) as typeof fetch;
  const provider = new OpenAIEmbeddingProvider(
    {
      apiKey: "not-a-real-key",
      model: "test-embedding-v1",
      dimensions: 2,
      maxRetries: 3,
    },
    { fetch: fetchMock, sleep: async () => undefined },
  );

  await assert.rejects(provider.embedQuery("query"), /failed \(401\)/);
  assert.equal(requestCount, 1);
});

test("rejects a vector with unexpected dimensions", async () => {
  const fetchMock = (async () =>
    jsonResponse({ data: [{ index: 0, embedding: [1] }] })) as typeof fetch;
  const provider = new OpenAIEmbeddingProvider(
    {
      apiKey: "not-a-real-key",
      model: "test-embedding-v1",
      dimensions: 2,
      maxRetries: 0,
    },
    { fetch: fetchMock },
  );

  await assert.rejects(
    provider.embedQuery("query"),
    /Embedding vector 0 dimensions differ: 1 !== 2/,
  );
});

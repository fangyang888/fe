import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEmbeddingProvider,
  readEmbeddingProviderName,
} from "../src/embeddings/factory.js";
import {
  readTransformersJsEmbeddingConfig,
  TransformersJsEmbeddingProvider,
} from "../src/embeddings/transformers-js.js";

test("uses the fixed Transformers.js profile by default", () => {
  assert.equal(readEmbeddingProviderName({}), "transformers-js");
  const config = readTransformersJsEmbeddingConfig({});

  assert.equal(config.model, "Xenova/multilingual-e5-small");
  assert.equal(
    config.revision,
    "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  );
  assert.equal(config.dimensions, 384);
  assert.equal(config.batchSize, 16);
  assert.equal(config.dtype, "q8");
  assert.equal(config.modelHubUrl, "https://hf-mirror.com/");
  assert.match(config.cacheDir ?? "", /\.cache\/transformers$/);
});

test("factory creates a Transformers.js provider without service configuration", () => {
  const provider = createEmbeddingProvider({});

  assert.equal(provider.provider, "transformers-js");
  assert.equal(
    provider.model,
    "Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  );
  assert.equal(provider.dimensions, 384);
});

test("loads one local pipeline lazily, prefixes E5 inputs, and batches texts", async () => {
  const loads: Array<{
    model: string;
    cacheDir: string;
    dtype: string;
    revision: string;
    modelHubUrl: string;
  }> = [];
  const calls: Array<{
    texts: string[];
    options: { pooling: "mean"; normalize: true };
  }> = [];
  const provider = new TransformersJsEmbeddingProvider(
    {
      model: "test/e5",
      revision: "test-revision",
      dimensions: 3,
      cacheDir: "/tmp/test-transformers-cache",
      batchSize: 2,
      dtype: "q8",
      modelHubUrl: "https://models.example/",
    },
    {
      loadPipeline: async (model, options) => {
        loads.push({ model, ...options });
        return async (texts, pipelineOptions) => {
          const batch = Array.isArray(texts) ? texts : [texts];
          calls.push({ texts: batch, options: pipelineOptions });
          return {
            dims: [batch.length, 3],
            data: Float32Array.from(
              batch.flatMap((_text, index) => [calls.length, index, 1]),
            ),
          };
        };
      },
    },
  );

  assert.deepEqual(await provider.embedDocuments(["one", "two", "three"]), [
    [1, 0, 1],
    [1, 1, 1],
    [2, 0, 1],
  ]);
  assert.deepEqual(await provider.embedQuery("find one"), [3, 0, 1]);
  assert.deepEqual(loads, [
    {
      model: "test/e5",
      cacheDir: "/tmp/test-transformers-cache",
      dtype: "q8",
      revision: "test-revision",
      modelHubUrl: "https://models.example/",
    },
  ]);
  assert.deepEqual(
    calls.map(({ texts }) => texts),
    [
      ["passage: one", "passage: two"],
      ["passage: three"],
      ["query: find one"],
    ],
  );
  assert.ok(
    calls.every(
      ({ options }) => options.pooling === "mean" && options.normalize === true,
    ),
  );
});

test("rejects invalid Transformers.js tensor dimensions", async () => {
  const provider = new TransformersJsEmbeddingProvider(
    { model: "test/e5", dimensions: 3 },
    {
      loadPipeline: async () => async () => ({
        dims: [1, 2],
        data: Float32Array.from([1, 0]),
      }),
    },
  );

  await assert.rejects(
    provider.embedQuery("query"),
    /returned tensor \[1, 2\]; expected \[1, 3\]/,
  );
});

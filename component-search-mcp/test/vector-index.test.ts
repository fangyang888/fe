import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { EmbeddingProvider } from "../src/embeddings/provider.js";
import { buildComponentIndex } from "../src/scanner.js";
import {
  buildVectorIndex,
  readVectorIndex,
  searchVectorIndex,
  writeVectorIndex,
} from "../src/vector-index.js";

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/project");

class CountingEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "fake";
  readonly model: string;
  readonly dimensions = 3;
  documentInputs: string[][] = [];

  constructor(model = "fake-v1") {
    this.model = model;
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    this.documentInputs.push([...texts]);
    return texts.map((text, index) => [text.length, index + 1, 1]);
  }

  async embedQuery(): Promise<number[]> {
    return [1, 0, 0];
  }
}

test("reuses unchanged vectors and regenerates changed documents", async () => {
  const components = await buildComponentIndex({ projectRoot: fixtureRoot });
  const firstProvider = new CountingEmbeddingProvider();
  const first = await buildVectorIndex(components, firstProvider);

  assert.equal(first.generatedCount, components.components.length);
  assert.equal(first.reusedCount, 0);

  const unchangedProvider = new CountingEmbeddingProvider();
  const unchanged = await buildVectorIndex(
    components,
    unchangedProvider,
    first.index,
  );
  assert.equal(unchanged.generatedCount, 0);
  assert.equal(unchanged.reusedCount, components.components.length);
  assert.deepEqual(unchangedProvider.documentInputs, []);

  const modifiedComponents = {
    ...components,
    components: components.components.map((component, index) =>
      index === 0
        ? { ...component, embeddingText: `${component.embeddingText}\nchanged` }
        : component,
    ),
  };
  const changedProvider = new CountingEmbeddingProvider();
  const changed = await buildVectorIndex(
    modifiedComponents,
    changedProvider,
    unchanged.index,
  );

  assert.equal(changed.generatedCount, 1);
  assert.equal(changed.reusedCount, components.components.length - 1);
  assert.equal(changedProvider.documentInputs[0]?.length, 1);
});

test("invalidates the complete cache when the embedding model changes", async () => {
  const components = await buildComponentIndex({ projectRoot: fixtureRoot });
  const first = await buildVectorIndex(
    components,
    new CountingEmbeddingProvider("fake-v1"),
  );
  const second = await buildVectorIndex(
    components,
    new CountingEmbeddingProvider("fake-v2"),
    first.index,
  );

  assert.equal(second.generatedCount, components.components.length);
  assert.equal(second.index.model, "fake-v2");
});

test("persists a private vector index atomically and searches it", async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "vector-index-test-"));
  const outputPath = path.join(temporaryDirectory, "vectors.json");

  try {
    const components = await buildComponentIndex({ projectRoot: fixtureRoot });
    const built = await buildVectorIndex(
      components,
      new CountingEmbeddingProvider(),
    );
    await writeVectorIndex(built.index, outputPath);
    const loaded = await readVectorIndex(outputPath);
    const matches = searchVectorIndex(loaded, [1, 0, 0], 2);

    assert.equal(loaded.records.length, components.components.length);
    assert.equal(matches.length, 2);
    assert.ok((matches[0]?.vectorScore ?? -1) >= (matches[1]?.vectorScore ?? 1));
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

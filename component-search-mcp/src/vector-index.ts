import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EmbeddingProvider } from "./embeddings/provider.js";
import { assertEmbeddingVector } from "./embeddings/provider.js";
import { cosineSimilarity } from "./vector-search.js";
import type { ComponentIndex } from "./types.js";

export interface VectorRecord {
  id: string;
  vector: number[];
  documentHash: string;
  indexedAt: string;
}

export interface ComponentVectorIndex {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  sourceFingerprint: string;
  provider: string;
  model: string;
  dimensions: number;
  records: VectorRecord[];
}

export interface BuildVectorIndexResult {
  index: ComponentVectorIndex;
  generatedCount: number;
  reusedCount: number;
}

export interface SemanticVectorMatch {
  id: string;
  vectorScore: number;
}

export function createDocumentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isReusableRecord(
  record: VectorRecord | undefined,
  documentHash: string,
  dimensions: number,
): record is VectorRecord {
  if (!record || record.documentHash !== documentHash) return false;
  try {
    assertEmbeddingVector(record.vector, dimensions, `Cached vector ${record.id}`);
    return true;
  } catch {
    return false;
  }
}

function isCompatibleIndex(
  index: ComponentVectorIndex | undefined,
  components: ComponentIndex,
  provider: EmbeddingProvider,
): index is ComponentVectorIndex {
  return (
    index?.schemaVersion === 1 &&
    index.projectRoot === components.projectRoot &&
    index.provider === provider.provider &&
    index.model === provider.model &&
    index.dimensions === provider.dimensions
  );
}

export async function buildVectorIndex(
  components: ComponentIndex,
  provider: EmbeddingProvider,
  previousIndex?: ComponentVectorIndex,
): Promise<BuildVectorIndexResult> {
  const previousRecords = isCompatibleIndex(previousIndex, components, provider)
    ? new Map(previousIndex.records.map((record) => [record.id, record]))
    : new Map<string, VectorRecord>();
  const recordsById = new Map<string, VectorRecord>();
  const changedComponents: Array<{
    id: string;
    embeddingText: string;
    documentHash: string;
  }> = [];

  for (const component of components.components) {
    const documentHash = createDocumentHash(component.embeddingText);
    const previousRecord = previousRecords.get(component.id);
    if (isReusableRecord(previousRecord, documentHash, provider.dimensions)) {
      recordsById.set(component.id, previousRecord);
    } else {
      changedComponents.push({
        id: component.id,
        embeddingText: component.embeddingText,
        documentHash,
      });
    }
  }

  const generatedVectors = changedComponents.length
    ? await provider.embedDocuments(
        changedComponents.map((component) => component.embeddingText),
      )
    : [];
  if (generatedVectors.length !== changedComponents.length) {
    throw new Error(
      `Embedding provider returned ${generatedVectors.length} vectors; expected ${changedComponents.length}`,
    );
  }

  const indexedAt = new Date().toISOString();
  changedComponents.forEach((component, index) => {
    const vector = generatedVectors[index];
    assertEmbeddingVector(vector, provider.dimensions, `Vector for ${component.id}`);
    recordsById.set(component.id, {
      id: component.id,
      vector,
      documentHash: component.documentHash,
      indexedAt,
    });
  });

  const records = components.components.map((component) => {
    const record = recordsById.get(component.id);
    if (!record) throw new Error(`Missing vector record for ${component.id}`);
    return record;
  });

  return {
    index: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      projectRoot: components.projectRoot,
      sourceFingerprint: components.sourceFingerprint,
      provider: provider.provider,
      model: provider.model,
      dimensions: provider.dimensions,
      records,
    },
    generatedCount: changedComponents.length,
    reusedCount: records.length - changedComponents.length,
  };
}

export function searchVectorIndex(
  index: ComponentVectorIndex,
  queryVector: readonly number[],
  limit = 20,
): SemanticVectorMatch[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`Search limit must be a non-negative integer: ${limit}`);
  }
  assertEmbeddingVector(queryVector, index.dimensions, "Query vector");

  return index.records
    .map((record, inputIndex) => {
      assertEmbeddingVector(record.vector, index.dimensions, `Vector for ${record.id}`);
      return {
        inputIndex,
        id: record.id,
        vectorScore: cosineSimilarity(queryVector, record.vector),
      };
    })
    .sort(
      (left, right) =>
        right.vectorScore - left.vectorScore || left.inputIndex - right.inputIndex,
    )
    .slice(0, limit)
    .map(({ id, vectorScore }) => ({ id, vectorScore }));
}

export async function readVectorIndex(
  indexPath: string,
): Promise<ComponentVectorIndex> {
  const parsed = JSON.parse(await fs.readFile(indexPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Vector index must be a JSON object");
  }
  const candidate = parsed as Partial<ComponentVectorIndex>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.projectRoot !== "string" ||
    typeof candidate.sourceFingerprint !== "string" ||
    typeof candidate.provider !== "string" ||
    typeof candidate.model !== "string" ||
    !Number.isInteger(candidate.dimensions) ||
    (candidate.dimensions ?? 0) <= 0 ||
    !Array.isArray(candidate.records)
  ) {
    throw new Error("Vector index has an invalid schema");
  }
  return candidate as ComponentVectorIndex;
}

export async function writeVectorIndex(
  index: ComponentVectorIndex,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(index)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

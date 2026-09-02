export interface EmbeddingProviderDescriptor {
  provider: string;
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider extends EmbeddingProviderDescriptor {
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export function assertEmbeddingVector(
  vector: unknown,
  dimensions: number,
  label = "Embedding vector",
): asserts vector is number[] {
  if (!Array.isArray(vector)) {
    throw new Error(`${label} must be an array`);
  }
  if (vector.length !== dimensions) {
    throw new Error(
      `${label} dimensions differ: ${vector.length} !== ${dimensions}`,
    );
  }
  if (!vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error(`${label} contains a non-finite number`);
  }
}

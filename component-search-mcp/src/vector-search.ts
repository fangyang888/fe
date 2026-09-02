/**
 * Calculate the cosine of the angle between two vectors.
 *
 * A zero vector has no direction, so this learning implementation returns 0
 * instead of producing NaN.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions differ: ${a.length} !== ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = a[index] as number;
    const valueB = b[index] as number;

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert text into a count vector whose dimensions follow vocabulary order. */
export function bagOfWords(
  text: string,
  vocabulary: readonly string[],
): number[] {
  return vocabulary.map((word) => {
    if (word.length === 0) {
      throw new Error("Vocabulary entries must not be empty");
    }

    return text.match(new RegExp(escapeRegExp(word), "g"))?.length ?? 0;
  });
}

export interface TextDocument {
  id: string;
  text: string;
}

export interface VectorSearchResult<T extends TextDocument> {
  item: T;
  score: number;
}

/**
 * Run an in-memory bag-of-words search and return the highest-scoring items.
 * The input array is never modified; equal scores retain their input order.
 */
export function searchByBagOfWords<T extends TextDocument>(
  query: string,
  documents: readonly T[],
  options: {
    vocabulary: readonly string[];
    limit?: number;
  },
): VectorSearchResult<T>[] {
  const { vocabulary } = options;
  const limit = options.limit ?? documents.length;

  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`Search limit must be a non-negative integer: ${limit}`);
  }

  const queryVector = bagOfWords(query, vocabulary);

  return documents
    .map((item, inputIndex) => ({
      inputIndex,
      item,
      score: cosineSimilarity(queryVector, bagOfWords(item.text, vocabulary)),
    }))
    .sort((left, right) => right.score - left.score || left.inputIndex - right.inputIndex)
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}

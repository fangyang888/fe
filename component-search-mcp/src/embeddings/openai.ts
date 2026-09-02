import type { EmbeddingProvider } from './provider.js';
import { assertEmbeddingVector } from './provider.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);

export interface OpenAIEmbeddingProviderConfig {
  apiKey: string;
  model: string;
  dimensions: number;
  baseUrl?: string;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

interface OpenAIEmbeddingProviderDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface EmbeddingResponseItem {
  index: number;
  embedding: unknown;
}

class EmbeddingHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmbeddingHttpError';
  }
}

function readPositiveInteger(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readNonNegativeInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

export function readOpenAIEmbeddingConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAIEmbeddingProviderConfig {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  const model = environment.COMPONENT_MCP_EMBEDDING_MODEL?.trim();

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required for semantic search; keyword search remains available without it',
    );
  }
  if (!model) {
    throw new Error('COMPONENT_MCP_EMBEDDING_MODEL is required');
  }

  return {
    apiKey,
    model,
    dimensions: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_DIMENSIONS,
      'COMPONENT_MCP_EMBEDDING_DIMENSIONS',
    ),
    baseUrl: environment.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    batchSize: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_BATCH_SIZE,
      'COMPONENT_MCP_EMBEDDING_BATCH_SIZE',
      64,
    ),
    timeoutMs: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_TIMEOUT_MS,
      'COMPONENT_MCP_EMBEDDING_TIMEOUT_MS',
      30_000,
    ),
    maxRetries: readNonNegativeInteger(
      environment.COMPONENT_MCP_EMBEDDING_MAX_RETRIES,
      'COMPONENT_MCP_EMBEDDING_MAX_RETRIES',
      3,
    ),
  };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'openai';
  readonly model: string;
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    config: OpenAIEmbeddingProviderConfig,
    dependencies: OpenAIEmbeddingProviderDependencies = {},
  ) {
    if (!config.apiKey.trim()) throw new Error('OpenAI API key must not be empty');
    if (!config.model.trim()) throw new Error('Embedding model must not be empty');
    if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
      throw new Error('Embedding dimensions must be a positive integer');
    }

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.endpoint = `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/embeddings`;
    this.batchSize = config.batchSize ?? 64;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.fetchImplementation = dependencies.fetch ?? fetch;
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));

    if (!Number.isInteger(this.batchSize) || this.batchSize <= 0 || this.batchSize > 2_048) {
      throw new Error('Embedding batch size must be an integer between 1 and 2048');
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('Embedding timeout must be a positive integer');
    }
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error('Embedding max retries must be a non-negative integer');
    }
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.some((text) => !text.trim())) {
      throw new Error('Embedding input must not be empty');
    }

    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const batch = texts.slice(offset, offset + this.batchSize);
      vectors.push(...(await this.embedBatch(batch)));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!text.trim()) throw new Error('Embedding query must not be empty');
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw new Error('Embedding API returned no query vector');
    return vector;
  }

  private async embedBatch(texts: readonly string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImplementation(this.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: texts,
            model: this.model,
            dimensions: this.dimensions,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const responseText = (await response.text()).slice(0, 500);
          const error = new EmbeddingHttpError(
            `Embedding API request failed (${response.status}): ${responseText || response.statusText}`,
            RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500,
          );
          if (!error.retryable || attempt === this.maxRetries) throw error;
          lastError = error;
        } else {
          const payload = (await response.json()) as { data?: unknown };
          return this.parseResponse(payload.data, texts.length);
        }
      } catch (error) {
        lastError = error;
        if (
          (error instanceof EmbeddingHttpError && !error.retryable) ||
          attempt === this.maxRetries
        ) {
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }

      const backoffMs = Math.min(250 * 2 ** attempt, 4_000);
      await this.sleep(backoffMs);
    }

    throw lastError instanceof Error ? lastError : new Error('Embedding API request failed');
  }

  private parseResponse(data: unknown, expectedCount: number): number[][] {
    if (!Array.isArray(data) || data.length !== expectedCount) {
      throw new Error(
        `Embedding API returned ${Array.isArray(data) ? data.length : 0} vectors; expected ${expectedCount}`,
      );
    }
    if (data.some((item) => !item || typeof item !== 'object')) {
      throw new Error('Embedding API returned an invalid data item');
    }

    const ordered = [...data].sort((left, right) => {
      const leftIndex = (left as Partial<EmbeddingResponseItem>).index;
      const rightIndex = (right as Partial<EmbeddingResponseItem>).index;
      return (leftIndex ?? -1) - (rightIndex ?? -1);
    });

    return ordered.map((item, expectedIndex) => {
      const responseItem = item as Partial<EmbeddingResponseItem>;
      if (responseItem.index !== expectedIndex) {
        throw new Error(`Embedding API returned an invalid index at ${expectedIndex}`);
      }
      assertEmbeddingVector(
        responseItem.embedding,
        this.dimensions,
        `Embedding vector ${expectedIndex}`,
      );
      return responseItem.embedding;
    });
  }
}

import type { EmbeddingProvider } from "./provider.js";
import { assertEmbeddingVector } from "./provider.js";

export const DEFAULT_OLLAMA_EMBEDDING_CONFIG = {
  model: "embeddinggemma:300m",
  dimensions: 768,
  baseUrl: "http://127.0.0.1:11434",
  batchSize: 32,
  timeoutMs: 120_000,
  maxRetries: 2,
  keepAlive: "5m",
} as const;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);

export interface OllamaEmbeddingProviderConfig {
  model: string;
  dimensions: number;
  baseUrl?: string;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
  keepAlive?: string;
}

interface OllamaEmbeddingProviderDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

class OllamaHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OllamaHttpError";
  }
}

function readPositiveInteger(
  value: string | undefined,
  name: string,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readNonNegativeInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

export function readOllamaEmbeddingConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OllamaEmbeddingProviderConfig {
  return {
    model:
      environment.COMPONENT_MCP_EMBEDDING_MODEL?.trim() ||
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.model,
    dimensions: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_DIMENSIONS,
      "COMPONENT_MCP_EMBEDDING_DIMENSIONS",
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.dimensions,
    ),
    baseUrl:
      environment.OLLAMA_BASE_URL?.trim() ||
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.baseUrl,
    batchSize: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_BATCH_SIZE,
      "COMPONENT_MCP_EMBEDDING_BATCH_SIZE",
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.batchSize,
    ),
    timeoutMs: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_TIMEOUT_MS,
      "COMPONENT_MCP_EMBEDDING_TIMEOUT_MS",
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.timeoutMs,
    ),
    maxRetries: readNonNegativeInteger(
      environment.COMPONENT_MCP_EMBEDDING_MAX_RETRIES,
      "COMPONENT_MCP_EMBEDDING_MAX_RETRIES",
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.maxRetries,
    ),
    keepAlive:
      environment.OLLAMA_KEEP_ALIVE?.trim() ||
      DEFAULT_OLLAMA_EMBEDDING_CONFIG.keepAlive,
  };
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "ollama";
  readonly model: string;
  readonly dimensions: number;

  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly keepAlive: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    config: OllamaEmbeddingProviderConfig,
    dependencies: OllamaEmbeddingProviderDependencies = {},
  ) {
    if (!config.model.trim()) throw new Error("Embedding model must not be empty");
    if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
      throw new Error("Embedding dimensions must be a positive integer");
    }

    this.model = config.model;
    this.dimensions = config.dimensions;
    this.endpoint = `${(config.baseUrl ?? DEFAULT_OLLAMA_EMBEDDING_CONFIG.baseUrl).replace(/\/+$/, "")}/api/embed`;
    this.batchSize = config.batchSize ?? DEFAULT_OLLAMA_EMBEDDING_CONFIG.batchSize;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_OLLAMA_EMBEDDING_CONFIG.timeoutMs;
    this.maxRetries = config.maxRetries ?? DEFAULT_OLLAMA_EMBEDDING_CONFIG.maxRetries;
    this.keepAlive = config.keepAlive ?? DEFAULT_OLLAMA_EMBEDDING_CONFIG.keepAlive;
    this.fetchImplementation = dependencies.fetch ?? fetch;
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));

    if (!Number.isInteger(this.batchSize) || this.batchSize <= 0) {
      throw new Error("Embedding batch size must be a positive integer");
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("Embedding timeout must be a positive integer");
    }
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error("Embedding max retries must be a non-negative integer");
    }
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.some((text) => !text.trim())) {
      throw new Error("Embedding input must not be empty");
    }

    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      vectors.push(
        ...(await this.embedBatch(texts.slice(offset, offset + this.batchSize))),
      );
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!text.trim()) throw new Error("Embedding query must not be empty");
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw new Error("Ollama returned no query vector");
    return vector;
  }

  private async embedBatch(texts: readonly string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImplementation(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
            truncate: false,
            keep_alive: this.keepAlive,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const responseText = (await response.text()).slice(0, 500);
          const error = new OllamaHttpError(
            `Ollama embedding request failed (${response.status}): ${responseText || response.statusText}`,
            RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500,
          );
          if (!error.retryable || attempt === this.maxRetries) throw error;
          lastError = error;
        } else {
          const payload = (await response.json()) as { embeddings?: unknown };
          return this.parseResponse(payload.embeddings, texts.length);
        }
      } catch (error) {
        lastError = error;
        if (
          (error instanceof OllamaHttpError && !error.retryable) ||
          attempt === this.maxRetries
        ) {
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }

      await this.sleep(Math.min(250 * 2 ** attempt, 4_000));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Ollama embedding request failed");
  }

  private parseResponse(embeddings: unknown, expectedCount: number): number[][] {
    if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
      throw new Error(
        `Ollama returned ${Array.isArray(embeddings) ? embeddings.length : 0} vectors; expected ${expectedCount}`,
      );
    }

    return embeddings.map((vector, index) => {
      assertEmbeddingVector(vector, this.dimensions, `Embedding vector ${index}`);
      return vector;
    });
  }
}

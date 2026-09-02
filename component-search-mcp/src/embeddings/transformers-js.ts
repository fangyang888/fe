import { resolveTransformersCachePath } from "../config.js";
import type { EmbeddingProvider } from "./provider.js";
import { assertEmbeddingVector } from "./provider.js";

export const DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG = {
  model: "Xenova/multilingual-e5-small",
  revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  dimensions: 384,
  batchSize: 16,
  dtype: "q8",
  modelHubUrl: "https://hf-mirror.com/",
} as const;

export interface TransformersJsEmbeddingProviderConfig {
  model: string;
  revision?: string;
  dimensions: number;
  cacheDir?: string;
  batchSize?: number;
  dtype?: "q8" | "fp32";
  modelHubUrl?: string;
}

interface EmbeddingTensor {
  data: ArrayLike<number>;
  dims: readonly number[];
}

interface FeatureExtractor {
  (
    texts: string | string[],
    options: { pooling: "mean"; normalize: true },
  ): Promise<EmbeddingTensor>;
}

interface TransformersJsEmbeddingProviderDependencies {
  loadPipeline?: (
    model: string,
    options: {
      cacheDir: string;
      dtype: "q8" | "fp32";
      revision: string;
      modelHubUrl: string;
    },
  ) => Promise<FeatureExtractor>;
}

function readPositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function readTransformersJsEmbeddingConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TransformersJsEmbeddingProviderConfig {
  const dtype =
    environment.COMPONENT_MCP_TRANSFORMERS_DTYPE?.trim() ||
    DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.dtype;
  if (dtype !== "q8" && dtype !== "fp32") {
    throw new Error("COMPONENT_MCP_TRANSFORMERS_DTYPE must be q8 or fp32");
  }

  return {
    model:
      environment.COMPONENT_MCP_EMBEDDING_MODEL?.trim() ||
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.model,
    revision:
      environment.COMPONENT_MCP_EMBEDDING_MODEL_REVISION?.trim() ||
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.revision,
    dimensions: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_DIMENSIONS,
      "COMPONENT_MCP_EMBEDDING_DIMENSIONS",
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.dimensions,
    ),
    cacheDir: resolveTransformersCachePath(
      environment.COMPONENT_MCP_MODEL_CACHE_PATH,
    ),
    batchSize: readPositiveInteger(
      environment.COMPONENT_MCP_EMBEDDING_BATCH_SIZE,
      "COMPONENT_MCP_EMBEDDING_BATCH_SIZE",
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.batchSize,
    ),
    dtype,
    modelHubUrl:
      environment.COMPONENT_MCP_MODEL_HUB_URL?.trim() ||
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.modelHubUrl,
  };
}

async function loadTransformersPipeline(
  model: string,
  options: {
    cacheDir: string;
    dtype: "q8" | "fp32";
    revision: string;
    modelHubUrl: string;
  },
): Promise<FeatureExtractor> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.remoteHost = `${options.modelHubUrl.replace(/\/+$/, "")}/`;
  return (await pipeline("feature-extraction", model, {
    cache_dir: options.cacheDir,
    dtype: options.dtype,
    revision: options.revision,
  })) as unknown as FeatureExtractor;
}

/**
 * Generates embeddings inside the current Node.js process with Transformers.js.
 * No API key or separately running model service is required. The model is loaded
 * lazily once and cached on disk by Transformers.js.
 */
export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "transformers-js";
  readonly model: string;
  readonly dimensions: number;

  private readonly sourceModel: string;
  private readonly revision: string;
  private readonly cacheDir: string;
  private readonly batchSize: number;
  private readonly dtype: "q8" | "fp32";
  private readonly modelHubUrl: string;
  private readonly loadPipeline: NonNullable<
    TransformersJsEmbeddingProviderDependencies["loadPipeline"]
  >;
  private extractorPromise?: Promise<FeatureExtractor>;

  constructor(
    config: TransformersJsEmbeddingProviderConfig,
    dependencies: TransformersJsEmbeddingProviderDependencies = {},
  ) {
    if (!config.model.trim()) throw new Error("Embedding model must not be empty");
    if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
      throw new Error("Embedding dimensions must be a positive integer");
    }

    this.sourceModel = config.model;
    this.revision =
      config.revision ?? DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.revision;
    if (!this.revision.trim()) throw new Error("Model revision must not be empty");
    this.model = `${this.sourceModel}@${this.revision}`;
    this.dimensions = config.dimensions;
    this.cacheDir = config.cacheDir ?? resolveTransformersCachePath();
    this.batchSize =
      config.batchSize ?? DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.batchSize;
    this.dtype = config.dtype ?? DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.dtype;
    this.modelHubUrl =
      config.modelHubUrl ??
      DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG.modelHubUrl;
    try {
      new URL(this.modelHubUrl);
    } catch {
      throw new Error("Model hub URL must be an absolute URL");
    }
    this.loadPipeline = dependencies.loadPipeline ?? loadTransformersPipeline;

    if (!Number.isInteger(this.batchSize) || this.batchSize <= 0) {
      throw new Error("Embedding batch size must be a positive integer");
    }
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    this.assertInputs(texts, "Embedding input");
    return this.embedTexts(texts.map((text) => `passage: ${text}`));
  }

  async embedQuery(text: string): Promise<number[]> {
    this.assertInputs([text], "Embedding query");
    const [vector] = await this.embedTexts([`query: ${text}`]);
    if (!vector) throw new Error("Transformers.js returned no query vector");
    return vector;
  }

  private assertInputs(texts: readonly string[], label: string): void {
    if (texts.some((text) => !text.trim())) {
      throw new Error(`${label} must not be empty`);
    }
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadPipeline(this.sourceModel, {
        cacheDir: this.cacheDir,
        dtype: this.dtype,
        revision: this.revision,
        modelHubUrl: this.modelHubUrl,
      }).catch((error) => {
        this.extractorPromise = undefined;
        throw new Error(
          `Failed to load Transformers.js model ${this.model}. First run requires access to ${this.modelHubUrl} or a pre-populated cache at ${this.cacheDir}`,
          { cause: error },
        );
      });
    }
    return this.extractorPromise;
  }

  private async embedTexts(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const extractor = await this.getExtractor();
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const batch = texts.slice(offset, offset + this.batchSize);
      const output = await extractor([...batch], {
        pooling: "mean",
        normalize: true,
      });
      vectors.push(...this.parseOutput(output, batch.length));
    }
    return vectors;
  }

  private parseOutput(output: EmbeddingTensor, expectedCount: number): number[][] {
    const expectedLength = expectedCount * this.dimensions;
    if (
      output.dims.length !== 2 ||
      output.dims[0] !== expectedCount ||
      output.dims[1] !== this.dimensions ||
      output.data.length !== expectedLength
    ) {
      throw new Error(
        `Transformers.js returned tensor [${output.dims.join(", ")}]; expected [${expectedCount}, ${this.dimensions}]`,
      );
    }

    const values = Array.from(output.data);
    return Array.from({ length: expectedCount }, (_unused, index) => {
      const vector = values.slice(
        index * this.dimensions,
        (index + 1) * this.dimensions,
      );
      assertEmbeddingVector(vector, this.dimensions, `Embedding vector ${index}`);
      return vector;
    });
  }
}

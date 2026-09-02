import type { EmbeddingProvider } from "./provider.js";
import {
  OllamaEmbeddingProvider,
  readOllamaEmbeddingConfig,
} from "./ollama.js";
import {
  OpenAIEmbeddingProvider,
  readOpenAIEmbeddingConfig,
} from "./openai.js";
import {
  readTransformersJsEmbeddingConfig,
  TransformersJsEmbeddingProvider,
} from "./transformers-js.js";

export type EmbeddingProviderName = "transformers-js" | "ollama" | "openai";

export function readEmbeddingProviderName(
  environment: NodeJS.ProcessEnv = process.env,
): EmbeddingProviderName {
  const name =
    environment.COMPONENT_MCP_EMBEDDING_PROVIDER?.trim() || "transformers-js";
  if (name !== "transformers-js" && name !== "ollama" && name !== "openai") {
    throw new Error(
      `Unsupported COMPONENT_MCP_EMBEDDING_PROVIDER: ${name}; expected transformers-js, ollama, or openai`,
    );
  }
  return name;
}

export function createEmbeddingProvider(
  environment: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider {
  const providerName = readEmbeddingProviderName(environment);
  if (providerName === "transformers-js") {
    return new TransformersJsEmbeddingProvider(
      readTransformersJsEmbeddingConfig(environment),
    );
  }
  if (providerName === "ollama") {
    return new OllamaEmbeddingProvider(readOllamaEmbeddingConfig(environment));
  }
  return new OpenAIEmbeddingProvider(readOpenAIEmbeddingConfig(environment));
}

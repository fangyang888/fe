#!/usr/bin/env node

import { createEmbeddingProvider } from "../embeddings/factory.js";
import { cosineSimilarity } from "../vector-search.js";

const provider = createEmbeddingProvider();
const texts = ["九宫格图片展示组件", "展示九张照片的网格组件"];
const [first, second] = await provider.embedDocuments(texts);

if (!first || !second) throw new Error("Embedding smoke test returned no vectors");

console.log(
  JSON.stringify(
    {
      provider: provider.provider,
      model: provider.model,
      dimensions: provider.dimensions,
      returnedDimensions: [first.length, second.length],
      cosineSimilarity: Number(cosineSimilarity(first, second).toFixed(6)),
    },
    null,
    2,
  ),
);

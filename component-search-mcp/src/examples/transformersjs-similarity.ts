#!/usr/bin/env node

import { createEmbeddingProvider } from "../embeddings/factory.js";
import { cosineSimilarity } from "../vector-search.js";

const provider = createEmbeddingProvider();
const query = "让客户填写可以联系到他的号码";
const candidates = [
  { id: "PhoneInput", text: "用于录入手机或电话号码的输入框" },
  { id: "DataTable", text: "用于分页展示业务数据的表格" },
  {
    id: "UserSelectModal",
    text: "从远程数据源选择一个或多个项目成员",
  },
];

const queryVector = await provider.embedQuery(query);
const candidateVectors = await provider.embedDocuments(
  candidates.map((candidate) => candidate.text),
);
const results = candidates
  .map((candidate, index) => {
    const vector = candidateVectors[index];
    if (!vector) throw new Error(`Missing vector for ${candidate.id}`);
    return {
      id: candidate.id,
      text: candidate.text,
      score: Number(cosineSimilarity(queryVector, vector).toFixed(6)),
    };
  })
  .sort((left, right) => right.score - left.score);

console.log(`Provider: ${provider.provider}`);
console.log(`Model: ${provider.model}`);
console.log(`Dimensions: ${provider.dimensions}`);
console.log(`Query: ${query}`);
console.table(results);
console.log("Expected Top-1: PhoneInput");
console.log(`Actual Top-1: ${results[0]?.id ?? "no result"}`);

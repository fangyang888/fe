#!/usr/bin/env node

import path from "node:path";
import { createEmbeddingProvider } from "../embeddings/factory.js";
import { buildComponentIndex } from "../scanner.js";
import { searchComponents } from "../search.js";
import { buildVectorIndex, searchVectorIndex } from "../vector-index.js";
import {
  RETRIEVAL_EVALUATION_CASES,
  type EvaluationCategory,
} from "./retrieval-evaluation-cases.js";

interface EvaluationRow {
  id: string;
  category: EvaluationCategory;
  query: string;
  expected: string;
  keywordTop1: string;
  semanticTop1: string;
  semanticScore: number;
  keywordCorrect: boolean;
  semanticCorrect: boolean;
  outcome: "语义新增命中" | "语义退化" | "两者正确" | "两者错误";
}

function percentage(correct: number, total: number): string {
  return total === 0 ? "0.0%" : `${((correct / total) * 100).toFixed(1)}%`;
}

function classifyOutcome(
  keywordCorrect: boolean,
  semanticCorrect: boolean,
): EvaluationRow["outcome"] {
  if (keywordCorrect && semanticCorrect) return "两者正确";
  if (!keywordCorrect && semanticCorrect) return "语义新增命中";
  if (keywordCorrect && !semanticCorrect) return "语义退化";
  return "两者错误";
}

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/project");
const provider = createEmbeddingProvider();
const componentIndex = await buildComponentIndex({ projectRoot: fixtureRoot });
const vectorBuild = await buildVectorIndex(componentIndex, provider);
const componentsById = new Map(
  componentIndex.components.map((component) => [component.id, component]),
);
const rows: EvaluationRow[] = [];

console.log(
  `Evaluating ${RETRIEVAL_EVALUATION_CASES.length} cases with ` +
    `${provider.provider}/${provider.model} (${provider.dimensions} dimensions)...`,
);

for (const evaluationCase of RETRIEVAL_EVALUATION_CASES) {
  const keywordTop1 =
    searchComponents(componentIndex, evaluationCase.query, { limit: 1 }).results[0]
      ?.name ?? "无结果";
  const queryVector = await provider.embedQuery(evaluationCase.query);
  const semanticMatch = searchVectorIndex(vectorBuild.index, queryVector, 1)[0];
  const semanticTop1 = semanticMatch
    ? (componentsById.get(semanticMatch.id)?.name ?? "无结果")
    : "无结果";
  const keywordCorrect = keywordTop1 === evaluationCase.expected;
  const semanticCorrect = semanticTop1 === evaluationCase.expected;

  rows.push({
    id: evaluationCase.id,
    category: evaluationCase.category,
    query: evaluationCase.query,
    expected: evaluationCase.expected,
    keywordTop1,
    semanticTop1,
    semanticScore: Number((semanticMatch?.vectorScore ?? 0).toFixed(4)),
    keywordCorrect,
    semanticCorrect,
    outcome: classifyOutcome(keywordCorrect, semanticCorrect),
  });
}

console.table(rows);

const categories: Array<EvaluationCategory | "all"> = [
  "semantic",
  "exact",
  "hard",
  "all",
];
const summary = categories.map((category) => {
  const selected =
    category === "all" ? rows : rows.filter((row) => row.category === category);
  const keywordCorrect = selected.filter((row) => row.keywordCorrect).length;
  const semanticCorrect = selected.filter((row) => row.semanticCorrect).length;

  return {
    category,
    cases: selected.length,
    keywordTop1: percentage(keywordCorrect, selected.length),
    semanticTop1: percentage(semanticCorrect, selected.length),
    change: `${(((semanticCorrect - keywordCorrect) / selected.length) * 100).toFixed(1)} pp`,
    semanticWins: selected.filter((row) => row.outcome === "语义新增命中").length,
    semanticRegressions: selected.filter((row) => row.outcome === "语义退化").length,
  };
});

console.log("\nTop-1 summary:");
console.table(summary);
console.log(
  "解读：先看 semantic 组新增了多少命中，再逐条检查 exact 组的语义退化；上线时应融合关键词与语义召回，不应只保留其中一种。",
);

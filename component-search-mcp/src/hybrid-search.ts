import { searchComponents } from "./search.js";
import type {
  ComponentIndex,
  ComponentMetadata,
  ComponentSearchMatch,
  ComponentSearchResult,
  SearchOptions,
} from "./types.js";
import type { SemanticVectorMatch } from "./vector-index.js";

const KEYWORD_WEIGHT = 0.6;
const SEMANTIC_WEIGHT = 0.4;

function clampScore(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function importExample(component: ComponentMetadata): string {
  return component.exportKind === "default"
    ? `import ${component.name} from "${component.exportPath}";`
    : `import { ${component.name} } from "${component.exportPath}";`;
}

/**
 * Blend deterministic keyword ranking with embedding similarity. Exact names
 * and props remain strong signals, while semantic-only candidates can still be
 * returned when the user's wording differs from the component documentation.
 */
export function searchComponentsHybrid(
  index: ComponentIndex,
  query: string,
  semanticMatches: readonly SemanticVectorMatch[],
  options: SearchOptions = {},
): ComponentSearchResult {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const keywordResult = searchComponents(index, query, {
    ...options,
    limit: 20,
  });
  const keywordById = new Map(
    keywordResult.results.map((component) => [component.id, component]),
  );
  const semanticById = new Map(
    semanticMatches.map((match) => [match.id, clampScore(match.vectorScore)]),
  );
  const componentsById = new Map(
    index.components.map((component) => [component.id, component]),
  );
  const candidateIds = new Set([
    ...keywordById.keys(),
    ...semanticById.keys(),
  ]);

  const ranked = [...candidateIds]
    .map((id): ComponentSearchMatch | undefined => {
      const component = componentsById.get(id);
      if (!component) return undefined;
      if (!options.includeDeprecated && component.status === "deprecated") {
        return undefined;
      }

      const keywordMatch = keywordById.get(id);
      const keywordScore = keywordMatch?.matchScore ?? 0;
      const semanticScore = semanticById.get(id) ?? 0;
      const combinedScore =
        KEYWORD_WEIGHT * keywordScore + SEMANTIC_WEIGHT * semanticScore;
      if (combinedScore <= 0) return undefined;

      return {
        ...component,
        score: Number((combinedScore * 100).toFixed(6)),
        matchScore: Number(combinedScore.toFixed(6)),
        matchReason: [
          ...(keywordMatch?.matchReason ?? []),
          ...(semanticById.has(id)
            ? [`语义相似度：${semanticScore.toFixed(4)}`]
            : []),
        ].slice(0, 6),
        importExample: keywordMatch?.importExample ?? importExample(component),
      };
    })
    .filter((component): component is ComponentSearchMatch => Boolean(component))
    .sort(
      (left, right) =>
        right.score - left.score || right.usageCount - left.usageCount,
    );

  const seenComponents = new Set<string>();
  const uniqueResults = ranked.filter((component) => {
    const key = `${component.sourcePath.replaceAll("\\", "/")}\0${component.name}`;
    if (seenComponents.has(key)) return false;
    seenComponents.add(key);
    return true;
  });

  return {
    query,
    projectRoot: index.projectRoot,
    projectName: index.projectName,
    sourceRoots: index.sourceRoots,
    searchMode: "hybrid",
    total: uniqueResults.length,
    results: uniqueResults.slice(0, limit),
  };
}

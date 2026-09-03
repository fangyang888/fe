#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  resolveAllowedRoots,
  resolveIndexPath,
  resolveProjectRoot,
  resolveRequestedProjectRoot,
  resolveScopedIndexPath,
  resolveVectorIndexPath,
} from "./config.js";
import { createEmbeddingProvider } from "./embeddings/factory.js";
import type { EmbeddingProvider } from "./embeddings/provider.js";
import { searchComponentsHybrid } from "./hybrid-search.js";
import {
  buildComponentIndex,
  createSourceSnapshot,
  readComponentIndex,
  writeComponentIndex,
} from "./scanner.js";
import { searchComponents } from "./search.js";
import {
  formatComponentSearchResult,
  toDisplayRelativePath,
} from "./search-result-format.js";
import { resolveSourceRootsForProject } from "./source-roots.js";
import type { ComponentIndex } from "./types.js";
import {
  buildVectorIndex,
  readVectorIndex,
  searchVectorIndex,
  writeVectorIndex,
  type ComponentVectorIndex,
} from "./vector-index.js";

type RequestedSearchMode = "keyword" | "hybrid";

const defaultProjectRoot = resolveProjectRoot();
const allowedRoots = resolveAllowedRoots(defaultProjectRoot);
const indexPath = resolveIndexPath();
const memoryIndexes = new Map<string, ComponentIndex>();
const memoryVectorIndexes = new Map<string, ComponentVectorIndex>();
const vectorIndexLoads = new Map<string, Promise<ComponentVectorIndex>>();
let embeddingProvider: EmbeddingProvider | undefined;

function readDefaultSearchMode(): RequestedSearchMode {
  const mode = process.env.COMPONENT_MCP_SEARCH_MODE?.trim() || "hybrid";
  if (mode !== "keyword" && mode !== "hybrid") {
    throw new Error(
      "COMPONENT_MCP_SEARCH_MODE must be either keyword or hybrid",
    );
  }
  return mode;
}

const defaultSearchMode = readDefaultSearchMode();

function createIndexKey(projectRoot: string, sourceRoots: string[]): string {
  return `${projectRoot}\0${[...sourceRoots].sort().join("\0")}`;
}

function componentIndexPath(projectRoot: string, sourceRoots: string[]): string {
  return projectRoot === defaultProjectRoot
    ? indexPath
    : resolveScopedIndexPath(projectRoot, sourceRoots);
}

async function loadIndex(
  projectRoot: string,
  sourceRoots: string[],
): Promise<ComponentIndex> {
  const indexKey = createIndexKey(projectRoot, sourceRoots);
  const sourceSnapshot = await createSourceSnapshot({ projectRoot, sourceRoots });
  const memoryIndex = memoryIndexes.get(indexKey);
  if (
    memoryIndex?.schemaVersion === 3 &&
    memoryIndex.sourceFingerprint === sourceSnapshot.fingerprint
  ) {
    return memoryIndex;
  }

  const projectIndexPath = componentIndexPath(projectRoot, sourceRoots);
  try {
    const diskIndex = await readComponentIndex(projectIndexPath);
    if (
      diskIndex.schemaVersion === 3 &&
      diskIndex.projectRoot === projectRoot &&
      createIndexKey(diskIndex.projectRoot, diskIndex.sourceRoots) === indexKey &&
      diskIndex.sourceFingerprint === sourceSnapshot.fingerprint
    ) {
      memoryIndexes.set(indexKey, diskIndex);
      return diskIndex;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to read component index: ${String(error)}`);
    }
  }

  const builtIndex = await buildComponentIndex({
    projectRoot,
    sourceRoots,
    sourceSnapshot,
  });
  memoryIndexes.set(indexKey, builtIndex);
  await writeComponentIndex(builtIndex, projectIndexPath);
  console.error(
    `Component index refreshed for ${projectRoot} (${sourceSnapshot.files.length} source files)`,
  );
  return builtIndex;
}

function getEmbeddingProvider(): EmbeddingProvider {
  embeddingProvider ??= createEmbeddingProvider();
  return embeddingProvider;
}

function isFreshVectorIndex(
  vectorIndex: ComponentVectorIndex | undefined,
  componentIndex: ComponentIndex,
  provider: EmbeddingProvider,
): vectorIndex is ComponentVectorIndex {
  return (
    vectorIndex?.schemaVersion === 1 &&
    vectorIndex.projectRoot === componentIndex.projectRoot &&
    vectorIndex.sourceFingerprint === componentIndex.sourceFingerprint &&
    vectorIndex.provider === provider.provider &&
    vectorIndex.model === provider.model &&
    vectorIndex.dimensions === provider.dimensions
  );
}

async function loadSemanticVectorIndex(
  componentIndex: ComponentIndex,
  provider: EmbeddingProvider,
): Promise<ComponentVectorIndex> {
  const componentKey = createIndexKey(
    componentIndex.projectRoot,
    componentIndex.sourceRoots,
  );
  const vectorKey = `${componentKey}\0${provider.provider}\0${provider.model}\0${provider.dimensions}`;
  const memoryIndex = memoryVectorIndexes.get(vectorKey);
  if (isFreshVectorIndex(memoryIndex, componentIndex, provider)) {
    return memoryIndex;
  }

  const activeLoad = vectorIndexLoads.get(vectorKey);
  if (activeLoad) return activeLoad;

  const load = (async () => {
    const vectorPath = resolveVectorIndexPath(
      undefined,
      componentIndexPath(
        componentIndex.projectRoot,
        componentIndex.sourceRoots,
      ),
    );
    let previousIndex: ComponentVectorIndex | undefined;
    try {
      previousIndex = await readVectorIndex(vectorPath);
      if (isFreshVectorIndex(previousIndex, componentIndex, provider)) {
        memoryVectorIndexes.set(vectorKey, previousIndex);
        return previousIndex;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Existing vector index cannot be reused: ${String(error)}`);
      }
    }

    const built = await buildVectorIndex(
      componentIndex,
      provider,
      previousIndex,
    );
    await writeVectorIndex(built.index, vectorPath);
    memoryVectorIndexes.set(vectorKey, built.index);
    console.error(
      `Semantic index refreshed for ${componentIndex.projectRoot} (${built.generatedCount} generated, ${built.reusedCount} reused)`,
    );
    return built.index;
  })();
  vectorIndexLoads.set(vectorKey, load);
  try {
    return await load;
  } finally {
    vectorIndexLoads.delete(vectorKey);
  }
}

const resultItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  scope: z.literal("project"),
  framework: z.enum(["react", "vue", "arkui"]),
  parser: z.enum(["typescript-ast", "vue-sfc-heuristic", "arkts-ast"]),
  projectName: z.string(),
  sourcePath: z
    .string()
    .describe("Original source path relative to the selected project root."),
  exportPath: z.string(),
  exportKind: z.enum(["named", "default"]),
  status: z.enum(["stable", "deprecated"]),
  keywords: z.array(z.string()),
  useCases: z.array(z.string()),
  props: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string().optional(),
    }),
  ),
  imports: z.array(z.string()),
  hooks: z.array(z.string()),
  renderedElements: z.array(z.string()),
  sourceSnippet: z.string(),
  embeddingText: z.string(),
  usageCount: z
    .number()
    .describe("Number of project usage sites. Must be printed for every result."),
  usedBy: z.array(z.string()),
  componentPath: z
    .string()
    .describe(
      "Full absolute component path string. Print it inside inline-code backticks; never convert it to a link or citation.",
    ),
  relativePath: z
    .string()
    .describe(
      "Display-relative component path such as /puzzle/src/components/PreviewModal.tsx.",
    ),
  displayPathMarkdown: z
    .string()
    .describe(
      "Ready-to-render Markdown. Copy this value verbatim as the only visible component path: its full relative-path label is clickable and targets componentPath.",
    ),
  importExample: z.string(),
});

export function createComponentSearchServer(): McpServer {
  const server = new McpServer(
  {
    name: "internal-component-search",
    version: "0.1.2",
  },
  {
    instructions:
      "在实现常见 UI 功能或新建组件前，先搜索当前或用户指定项目的已有组件。默认使用关键词与 Embedding 混合检索；语义模型不可用时自动回退关键词检索。需要切换项目时传入 projectRoot；省略 sourceRoots 可自动发现源码目录。结果已按组件名和实际文件路径去重。向用户展示候选组件时，组件标题使用普通文字；每个组件只展示一条组件路径，必须逐字复制 displayPathMarkdown，不要同时打印 sourcePath、componentPath 或 relativePath。每个候选还必须打印描述、Props 和 usageCount 的明确次数。不要展示内部排序分或匹配原因。本服务只读项目源码。",
  },
);

  server.registerTool(
  "search_internal_component",
  {
    title: "Search internal project components",
    description:
      "Search deduplicated reusable frontend components with hybrid keyword and semantic ranking. Falls back to keyword ranking when embeddings are unavailable. For each result, render its plain component title and copy displayPathMarkdown verbatim as the only visible path. Also print numeric usageCount, description, and props. Internal ranking scores and reasons are intentionally omitted.",
    inputSchema: {
      query: z.string().min(1).describe("Natural-language component requirement"),
      limit: z.number().int().min(1).max(20).default(5),
      includeDeprecated: z.boolean().default(false),
      searchMode: z
        .enum(["keyword", "hybrid"])
        .default(defaultSearchMode)
        .describe(
          "Use hybrid for keyword plus semantic ranking, or keyword to avoid loading an embedding model.",
        ),
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Project root to search. It must be inside COMPONENT_MCP_ALLOWED_ROOTS. Defaults to the server project root.",
        ),
      sourceRoots: z
        .array(z.string())
        .max(50)
        .optional()
        .describe(
          "Source directories relative to projectRoot. When omitted, common source and workspace directories are discovered automatically.",
        ),
    },
    outputSchema: {
      query: z.string(),
      projectRoot: z.string(),
      projectName: z.string(),
      sourceRoots: z.array(z.string()),
      searchMode: z.enum(["keyword", "hybrid", "keyword-fallback"]),
      semanticModel: z.string().optional(),
      semanticWarning: z.string().optional(),
      total: z.number(),
      results: z.array(resultItemSchema),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async ({
    query,
    limit,
    includeDeprecated,
    searchMode,
    projectRoot,
    sourceRoots,
  }) => {
    const requestedProjectRoot = resolveRequestedProjectRoot(
      projectRoot,
      defaultProjectRoot,
      allowedRoots,
    );
    await fs.access(requestedProjectRoot);
    const requestedSourceRoots = await resolveSourceRootsForProject(
      requestedProjectRoot,
      sourceRoots,
      { useEnvironment: requestedProjectRoot === defaultProjectRoot },
    );
    const index = await loadIndex(requestedProjectRoot, requestedSourceRoots);
    let result;
    if (searchMode === "keyword") {
      result = searchComponents(index, query, { limit, includeDeprecated });
    } else {
      try {
        const provider = getEmbeddingProvider();
        const vectorIndex = await loadSemanticVectorIndex(index, provider);
        const queryVector = await provider.embedQuery(query);
        const semanticMatches = searchVectorIndex(
          vectorIndex,
          queryVector,
          Math.min(index.components.length, Math.max(limit * 4, 20)),
        );
        result = {
          ...searchComponentsHybrid(index, query, semanticMatches, {
            limit,
            includeDeprecated,
          }),
          semanticModel: `${provider.provider}:${provider.model}`,
        };
      } catch (error) {
        const warning = error instanceof Error ? error.message : String(error);
        console.error(
          `Semantic search unavailable; falling back to keyword search: ${warning}`,
        );
        result = {
          ...searchComponents(index, query, { limit, includeDeprecated }),
          searchMode: "keyword-fallback" as const,
          semanticWarning: warning.slice(0, 500),
        };
      }
    }
    const summary = formatComponentSearchResult(result);
    const publicResult = {
      ...result,
      results: result.results.map(
        ({
          score: _score,
          matchScore: _matchScore,
          matchReason: _matchReason,
          ...component
        }) => ({
          ...component,
          componentPath: path.resolve(result.projectRoot, component.sourcePath),
          relativePath: toDisplayRelativePath(component.sourcePath),
          displayPathMarkdown: `[${toDisplayRelativePath(component.sourcePath)}](<${path.resolve(result.projectRoot, component.sourcePath)}>)`,
        }),
      ),
    };

    return {
      structuredContent: publicResult,
      content: [{ type: "text", text: summary }],
    };
  },
  );

  return server;
}

async function main(): Promise<void> {
  await fs.access(defaultProjectRoot);
  const defaultSourceRoots = await resolveSourceRootsForProject(defaultProjectRoot);
  const server = createComponentSearchServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Internal component search MCP started for ${defaultProjectRoot} (${defaultSourceRoots.join(", ")})`,
  );
}

async function isDirectExecution(): Promise<boolean> {
  const entryPath = process.argv[1];
  if (!entryPath) return false;

  const modulePath = fileURLToPath(import.meta.url);
  try {
    const [resolvedEntryPath, resolvedModulePath] = await Promise.all([
      fs.realpath(entryPath),
      fs.realpath(modulePath),
    ]);
    return resolvedEntryPath === resolvedModulePath;
  } catch {
    return path.resolve(entryPath) === modulePath;
  }
}

if (await isDirectExecution()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

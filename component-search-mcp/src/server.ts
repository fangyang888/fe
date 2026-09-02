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
} from "./config.js";
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

const defaultProjectRoot = resolveProjectRoot();
const allowedRoots = resolveAllowedRoots(defaultProjectRoot);
const indexPath = resolveIndexPath();
const memoryIndexes = new Map<string, ComponentIndex>();

function createIndexKey(projectRoot: string, sourceRoots: string[]): string {
  return `${projectRoot}\0${[...sourceRoots].sort().join("\0")}`;
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

  const projectIndexPath =
    projectRoot === defaultProjectRoot
      ? indexPath
      : resolveScopedIndexPath(projectRoot, sourceRoots);
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

const resultItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  scope: z.literal("project"),
  framework: z.enum(["react", "vue"]),
  parser: z.enum(["typescript-ast", "vue-sfc-heuristic"]),
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
    version: "0.1.0",
  },
  {
    instructions:
      "在实现常见 UI 功能或新建组件前，先搜索当前或用户指定项目的已有组件。需要切换项目时传入 projectRoot；省略 sourceRoots 可自动发现源码目录。结果已按组件名和实际文件路径去重。向用户展示候选组件时，组件标题使用普通文字；每个组件只展示一条组件路径，必须逐字复制 displayPathMarkdown，不要同时打印 sourcePath、componentPath 或 relativePath。displayPathMarkdown 的可见文字是完整相对路径，点击后打开 componentPath 指向的实际文件。每个候选还必须打印描述、Props 和 usageCount 的明确次数。不要展示内部排序分或匹配原因。不要把搜索结果当成写操作；本服务只读项目源码。",
  },
);

  server.registerTool(
  "search_internal_component",
  {
    title: "Search internal project components",
    description:
      "Search deduplicated reusable frontend components in the current or explicitly selected project. For each result, render its plain component title and copy displayPathMarkdown verbatim as the only visible path; the full relative-path label is clickable and opens componentPath. Do not separately print sourcePath, componentPath, or relativePath. Also print numeric usageCount, description, and props. Internal ranking scores and reasons are intentionally omitted.",
    inputSchema: {
      query: z.string().min(1).describe("Natural-language component requirement"),
      limit: z.number().int().min(1).max(20).default(5),
      includeDeprecated: z.boolean().default(false),
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
      total: z.number(),
      results: z.array(resultItemSchema),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async ({ query, limit, includeDeprecated, projectRoot, sourceRoots }) => {
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
    const result = searchComponents(index, query, {
      limit,
      includeDeprecated,
    });
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

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

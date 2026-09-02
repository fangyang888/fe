#!/usr/bin/env node

import { promises as fs } from "node:fs";
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
  sourcePath: z.string(),
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
  usageCount: z.number(),
  usedBy: z.array(z.string()),
  score: z.number(),
  matchScore: z.number(),
  matchReason: z.array(z.string()),
  importExample: z.string(),
});

const server = new McpServer(
  {
    name: "internal-component-search",
    version: "0.1.0",
  },
  {
    instructions:
      "在实现常见 UI 功能或新建组件前，先搜索当前或用户指定项目的已有组件。需要切换项目时传入 projectRoot；省略 sourceRoots 可自动发现源码目录。优先推荐稳定且已有实际使用记录的组件，并依据 sourcePath 和 usedBy 检查真实用法。不要把搜索结果当成写操作；本服务只读项目源码。",
  },
);

server.registerTool(
  "search_internal_component",
  {
    title: "Search internal project components",
    description:
      "Search reusable frontend components in the current or explicitly selected project. Use before implementing common UI, when the user asks whether an existing component can be reused, or when you need source paths, props, and real usage locations. Source directories are discovered automatically when sourceRoots is omitted.",
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
    const summary = result.results.length
      ? result.results
          .map(
            (component, position) =>
              `${position + 1}. ${component.name}\n` +
              `   路径：${component.sourcePath}\n` +
              `   匹配分：${component.matchScore.toFixed(2)}\n` +
              `   原因：${component.matchReason.join("；")}`,
          )
          .join("\n")
      : "没有找到匹配的项目组件。可以尝试组件名、业务用途或 Props 关键词。";

    return {
      structuredContent: result,
      content: [{ type: "text", text: summary }],
    };
  },
);

async function main(): Promise<void> {
  await fs.access(defaultProjectRoot);
  const defaultSourceRoots = await resolveSourceRootsForProject(defaultProjectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Internal component search MCP started for ${defaultProjectRoot} (${defaultSourceRoots.join(", ")})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

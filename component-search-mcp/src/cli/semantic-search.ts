#!/usr/bin/env node

import {
  resolveIndexPath,
  resolveProjectRoot,
  resolveVectorIndexPath,
} from "../config.js";
import { createEmbeddingProvider } from "../embeddings/factory.js";
import {
  buildComponentIndex,
  createSourceSnapshot,
  readComponentIndex,
  writeComponentIndex,
} from "../scanner.js";
import { resolveSourceRootsForProject } from "../source-roots.js";
import type { ComponentIndex } from "../types.js";
import {
  buildVectorIndex,
  readVectorIndex,
  searchVectorIndex,
  writeVectorIndex,
} from "../vector-index.js";
import { readOption, readOptions } from "./args.js";

const query = readOption("--query") ?? process.argv.slice(2).join(" ");
if (!query.trim()) {
  console.error('Usage: pnpm search:semantic -- --query "九宫格图片组件"');
  process.exit(1);
}

const projectRoot = resolveProjectRoot(readOption("--project-root"));
const sourceRoots = await resolveSourceRootsForProject(
  projectRoot,
  readOptions("--source-root"),
);
const componentIndexPath = resolveIndexPath(readOption("--index"));
const vectorIndexPath = resolveVectorIndexPath(
  readOption("--vector-index"),
  componentIndexPath,
);
const requestedLimit = Number(readOption("--limit") ?? 5);
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
  throw new Error("--limit must be an integer between 1 and 20");
}

const sourceSnapshot = await createSourceSnapshot({ projectRoot, sourceRoots });
let componentIndex: ComponentIndex;
try {
  const diskIndex = await readComponentIndex(componentIndexPath);
  if (
    diskIndex.schemaVersion !== 3 ||
    diskIndex.projectRoot !== projectRoot ||
    JSON.stringify([...diskIndex.sourceRoots].sort()) !==
      JSON.stringify([...sourceRoots].sort()) ||
    diskIndex.sourceFingerprint !== sourceSnapshot.fingerprint
  ) {
    throw new Error("Component index is stale");
  }
  componentIndex = diskIndex;
} catch {
  componentIndex = await buildComponentIndex({
    projectRoot,
    sourceRoots,
    sourceSnapshot,
  });
  await writeComponentIndex(componentIndex, componentIndexPath);
}

const provider = createEmbeddingProvider();
let previousVectorIndex;
try {
  previousVectorIndex = await readVectorIndex(vectorIndexPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    console.error(`Existing vector index cannot be reused: ${String(error)}`);
  }
}

const buildResult = await buildVectorIndex(
  componentIndex,
  provider,
  previousVectorIndex,
);
await writeVectorIndex(buildResult.index, vectorIndexPath);

const queryVector = await provider.embedQuery(query);
const componentsById = new Map(
  componentIndex.components.map((component) => [component.id, component]),
);
const results = searchVectorIndex(
  buildResult.index,
  queryVector,
  requestedLimit,
).map((match) => {
  const component = componentsById.get(match.id);
  if (!component) throw new Error(`Vector points to missing component ${match.id}`);
  return {
    id: match.id,
    name: component.name,
    description: component.description,
    sourcePath: component.sourcePath,
    vectorScore: Number(match.vectorScore.toFixed(6)),
  };
});

console.log(
  JSON.stringify(
    {
      query,
      model: buildResult.index.model,
      dimensions: buildResult.index.dimensions,
      generatedVectors: buildResult.generatedCount,
      reusedVectors: buildResult.reusedCount,
      results,
    },
    null,
    2,
  ),
);

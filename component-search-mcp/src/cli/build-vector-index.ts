#!/usr/bin/env node

import {
  resolveIndexPath,
  resolveProjectRoot,
  resolveVectorIndexPath,
} from "../config.js";
import { createEmbeddingProvider } from "../embeddings/factory.js";
import { buildComponentIndex, writeComponentIndex } from "../scanner.js";
import { resolveSourceRootsForProject } from "../source-roots.js";
import {
  buildVectorIndex,
  readVectorIndex,
  writeVectorIndex,
} from "../vector-index.js";
import { readOption, readOptions } from "./args.js";

const projectRoot = resolveProjectRoot(readOption("--project-root"));
const sourceRoots = await resolveSourceRootsForProject(
  projectRoot,
  readOptions("--source-root"),
);
const componentIndexPath = resolveIndexPath(readOption("--index"));
const vectorIndexPath = resolveVectorIndexPath(
  readOption("--vector-output"),
  componentIndexPath,
);
const provider = createEmbeddingProvider();

const componentIndex = await buildComponentIndex({ projectRoot, sourceRoots });
await writeComponentIndex(componentIndex, componentIndexPath);

let previousIndex;
try {
  previousIndex = await readVectorIndex(vectorIndexPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    console.error(`Existing vector index cannot be reused: ${String(error)}`);
  }
}

const result = await buildVectorIndex(componentIndex, provider, previousIndex);
await writeVectorIndex(result.index, vectorIndexPath);

console.log(`Embedded ${result.index.records.length} components.`);
console.log(`Generated: ${result.generatedCount}; reused: ${result.reusedCount}.`);
console.log(`Model: ${result.index.model}; dimensions: ${result.index.dimensions}.`);
console.log(`Vector index: ${vectorIndexPath}`);

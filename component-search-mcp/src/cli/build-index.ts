#!/usr/bin/env node

import {
  resolveIndexPath,
  resolveProjectRoot,
} from "../config.js";
import { buildComponentIndex, writeComponentIndex } from "../scanner.js";
import { resolveSourceRootsForProject } from "../source-roots.js";
import { readOption, readOptions } from "./args.js";

const projectRoot = resolveProjectRoot(readOption("--project-root"));
const requestedSourceRoots = readOptions("--source-root");
const sourceRoots = await resolveSourceRootsForProject(
  projectRoot,
  requestedSourceRoots,
);
const outputPath = resolveIndexPath(readOption("--output"));

const index = await buildComponentIndex({ projectRoot, sourceRoots });
await writeComponentIndex(index, outputPath);

console.log(`Indexed ${index.components.length} components from ${index.projectName}.`);
console.log(`Index: ${outputPath}`);

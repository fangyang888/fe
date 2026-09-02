#!/usr/bin/env node

import {
  resolveIndexPath,
  resolveProjectRoot,
} from "../config.js";
import {
  buildComponentIndex,
  createSourceSnapshot,
  readComponentIndex,
  writeComponentIndex,
} from "../scanner.js";
import { searchComponents } from "../search.js";
import { resolveSourceRootsForProject } from "../source-roots.js";
import type { ComponentIndex } from "../types.js";
import { readOption, readOptions } from "./args.js";

const query = readOption("--query") ?? process.argv.slice(2).join(" ");
if (!query) {
  console.error('Usage: pnpm search:components -- --query "用户选择弹窗"');
  process.exit(1);
}

const projectRoot = resolveProjectRoot(readOption("--project-root"));
const sourceRoots = await resolveSourceRootsForProject(
  projectRoot,
  readOptions("--source-root"),
);
const indexPath = resolveIndexPath(readOption("--index"));
const sourceSnapshot = await createSourceSnapshot({ projectRoot, sourceRoots });
let index: ComponentIndex;

try {
  index = await readComponentIndex(indexPath);
  if (
    index.schemaVersion !== 3 ||
    index.projectRoot !== projectRoot ||
    JSON.stringify([...index.sourceRoots].sort()) !==
      JSON.stringify([...sourceRoots].sort()) ||
    index.sourceFingerprint !== sourceSnapshot.fingerprint
  ) {
    index = await buildComponentIndex({
      projectRoot,
      sourceRoots,
      sourceSnapshot,
    });
    await writeComponentIndex(index, indexPath);
  }
} catch {
  index = await buildComponentIndex({
    projectRoot,
    sourceRoots,
    sourceSnapshot,
  });
  await writeComponentIndex(index, indexPath);
}

console.log(JSON.stringify(searchComponents(index, query), null, 2));

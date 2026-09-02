import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findPackageRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Cannot locate component-search-mcp package root");
    }
    current = parent;
  }
}

const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

export function resolveProjectRoot(explicitRoot?: string): string {
  return path.resolve(
    explicitRoot ?? process.env.COMPONENT_MCP_PROJECT_ROOT ?? process.cwd(),
  );
}

export function resolveAllowedRoots(defaultProjectRoot: string): string[] {
  const configured = process.env.COMPONENT_MCP_ALLOWED_ROOTS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));
  return [...new Set([path.resolve(defaultProjectRoot), ...(configured ?? [])])];
}

export function resolveRequestedProjectRoot(
  requestedRoot: string | undefined,
  defaultProjectRoot: string,
  allowedRoots: string[],
): string {
  const projectRoot = requestedRoot
    ? path.resolve(defaultProjectRoot, requestedRoot)
    : path.resolve(defaultProjectRoot);
  const allowed = allowedRoots.some((allowedRoot) => {
    const relative = path.relative(path.resolve(allowedRoot), projectRoot);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (!allowed) {
    throw new Error(
      `Project root is outside COMPONENT_MCP_ALLOWED_ROOTS: ${projectRoot}`,
    );
  }
  return projectRoot;
}

export function resolveIndexPath(explicitPath?: string): string {
  return path.resolve(
    explicitPath ??
      process.env.COMPONENT_MCP_INDEX_PATH ??
      path.join(packageRoot, ".cache", "components-index.json"),
  );
}

export function resolveScopedIndexPath(
  projectRoot: string,
  sourceRoots: string[],
): string {
  const cacheKey = createHash("sha256")
    .update(JSON.stringify([path.resolve(projectRoot), [...sourceRoots].sort()]))
    .digest("hex")
    .slice(0, 20);
  const cacheRoot = process.env.COMPONENT_MCP_INDEX_PATH
    ? path.dirname(resolveIndexPath())
    : path.join(packageRoot, ".cache");
  return path.join(cacheRoot, "projects", `${cacheKey}.json`);
}

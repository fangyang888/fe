import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const CACHE_DIRECTORY_NAME = "internal-component-search-mcp";

export function resolveCacheRoot(
  explicitPath?: string,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = os.homedir(),
): string {
  const configuredPath =
    explicitPath ?? environment.COMPONENT_MCP_CACHE_PATH?.trim();
  if (configuredPath) return path.resolve(configuredPath);

  const xdgCacheHome = environment.XDG_CACHE_HOME?.trim();
  if (xdgCacheHome) {
    return path.resolve(xdgCacheHome, CACHE_DIRECTORY_NAME);
  }

  const localAppData = environment.LOCALAPPDATA?.trim();
  if (platform === "win32" && localAppData) {
    return path.resolve(localAppData, CACHE_DIRECTORY_NAME);
  }

  return platform === "darwin"
    ? path.join(homeDirectory, "Library", "Caches", CACHE_DIRECTORY_NAME)
    : path.join(homeDirectory, ".cache", CACHE_DIRECTORY_NAME);
}

function projectCacheKey(projectRoot: string): string {
  return createHash("sha256")
    .update(path.resolve(projectRoot))
    .digest("hex")
    .slice(0, 20);
}

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

export function resolveIndexPath(
  explicitPath?: string,
  projectRoot: string = resolveProjectRoot(),
): string {
  return path.resolve(
    explicitPath ??
      process.env.COMPONENT_MCP_INDEX_PATH ??
      path.join(
        resolveCacheRoot(),
        "indexes",
        `${projectCacheKey(projectRoot)}.json`,
      ),
  );
}

export function resolveVectorIndexPath(
  explicitPath?: string,
  componentIndexPath = resolveIndexPath(),
): string {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.COMPONENT_MCP_VECTOR_INDEX_PATH) {
    return path.resolve(process.env.COMPONENT_MCP_VECTOR_INDEX_PATH);
  }

  const parsed = path.parse(componentIndexPath);
  return path.join(parsed.dir, `${parsed.name}.vectors.json`);
}

export function resolveTransformersCachePath(explicitPath?: string): string {
  return path.resolve(
    explicitPath ??
      process.env.COMPONENT_MCP_MODEL_CACHE_PATH ??
      path.join(resolveCacheRoot(), "models"),
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
    : path.join(resolveCacheRoot(), "indexes");
  return path.join(cacheRoot, "projects", `${cacheKey}.json`);
}

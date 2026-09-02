import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx", ".vue"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const DIRECT_SOURCE_DIRECTORIES = ["src", "modules", "components", "pages"];
const WORKSPACE_CONTAINERS = ["apps", "packages"];

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function containsSourceFile(directory: string, depth = 4): Promise<boolean> {
  if (depth < 0) return false;

  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      return true;
    }
    if (
      entry.isDirectory() &&
      !IGNORED_DIRECTORIES.has(entry.name) &&
      (await containsSourceFile(path.join(directory, entry.name), depth - 1))
    ) {
      return true;
    }
  }

  return false;
}

function globSegmentToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function expandWorkspacePattern(
  projectRoot: string,
  workspacePattern: string,
): Promise<string[]> {
  const normalized = workspacePattern
    .replace(/^!/, "")
    .replace(/\/package\.json$/, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");

  if (!normalized || normalized.startsWith("../") || path.isAbsolute(normalized)) {
    return [];
  }

  let candidates = [projectRoot];
  for (const segment of normalized.split("/").filter(Boolean)) {
    if (!segment.includes("*")) {
      candidates = candidates.map((candidate) => path.join(candidate, segment));
      continue;
    }

    const matcher = globSegmentToRegExp(segment);
    const expanded: string[] = [];
    for (const candidate of candidates) {
      let entries;
      try {
        entries = await fs.readdir(candidate, { withFileTypes: true });
      } catch {
        continue;
      }
      expanded.push(
        ...entries
          .filter((entry) => entry.isDirectory() && matcher.test(entry.name))
          .map((entry) => path.join(candidate, entry.name)),
      );
    }
    candidates = expanded;
  }

  return candidates.filter(isDirectory);
}

async function readWorkspaceDirectories(projectRoot: string): Promise<string[]> {
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as {
      workspaces?: string[] | { packages?: string[] };
    };
    const patterns = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces
      : packageJson.workspaces?.packages ?? [];
    return (
      await Promise.all(
        patterns
          .filter((pattern) => !pattern.startsWith("!"))
          .map((pattern) => expandWorkspacePattern(projectRoot, pattern)),
      )
    ).flat();
  } catch {
    return [];
  }
}

function toRelativeRoot(projectRoot: string, sourceRoot: string): string {
  const relative = path.relative(projectRoot, sourceRoot);
  return relative ? relative.split(path.sep).join("/") : ".";
}

async function preferredWorkspaceSourceRoot(
  workspaceRoot: string,
): Promise<string | undefined> {
  const srcRoot = path.join(workspaceRoot, "src");
  if ((await isDirectory(srcRoot)) && (await containsSourceFile(srcRoot))) {
    return srcRoot;
  }
  return (await containsSourceFile(workspaceRoot)) ? workspaceRoot : undefined;
}

export async function discoverSourceRoots(projectRoot: string): Promise<string[]> {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const discovered = new Set<string>();

  for (const directoryName of DIRECT_SOURCE_DIRECTORIES) {
    const candidate = path.join(normalizedProjectRoot, directoryName);
    if ((await isDirectory(candidate)) && (await containsSourceFile(candidate))) {
      discovered.add(toRelativeRoot(normalizedProjectRoot, candidate));
    }
  }

  const workspaceDirectories = new Set(
    await readWorkspaceDirectories(normalizedProjectRoot),
  );
  for (const containerName of WORKSPACE_CONTAINERS) {
    const containerPath = path.join(normalizedProjectRoot, containerName);
    let entries;
    try {
      entries = await fs.readdir(containerPath, { withFileTypes: true });
    } catch {
      continue;
    }
    entries
      .filter((entry) => entry.isDirectory())
      .forEach((entry) =>
        workspaceDirectories.add(path.join(containerPath, entry.name)),
      );
  }

  for (const workspaceDirectory of workspaceDirectories) {
    const preferred = await preferredWorkspaceSourceRoot(workspaceDirectory);
    if (preferred) {
      discovered.add(toRelativeRoot(normalizedProjectRoot, preferred));
    }
  }

  return discovered.size ? [...discovered].sort() : ["."];
}

export function normalizeSourceRoots(
  projectRoot: string,
  sourceRoots: string[],
): string[] {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const roots = sourceRoots.map((sourceRoot) => {
    const absoluteRoot = path.resolve(normalizedProjectRoot, sourceRoot);
    const relative = path.relative(normalizedProjectRoot, absoluteRoot);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Source root is outside the project root: ${sourceRoot}`);
    }
    return relative ? relative.split(path.sep).join("/") : ".";
  });
  return [...new Set(roots)];
}

export async function resolveSourceRootsForProject(
  projectRoot: string,
  explicitRoots?: string[],
  options: { useEnvironment?: boolean } = {},
): Promise<string[]> {
  const useEnvironment = options.useEnvironment ?? true;
  const configuredRoots = explicitRoots?.length
    ? explicitRoots
    : useEnvironment
      ? process.env.COMPONENT_MCP_SOURCE_ROOTS
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
      : undefined;
  return normalizeSourceRoots(
    projectRoot,
    configuredRoots?.length
      ? configuredRoots
      : await discoverSourceRoots(projectRoot),
  );
}

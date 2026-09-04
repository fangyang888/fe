import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedRegionConfig, VisualQaCache } from "./types.js";

const execFileAsync = promisify(execFile);

export function emptyCache(): VisualQaCache {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    designs: {},
    assets: {},
    code: { revision: "unknown", version: "unknown", changedFiles: [] },
    verifications: {},
  };
}

export async function readCache(cachePath: string): Promise<VisualQaCache> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8")) as VisualQaCache;
    return parsed.schemaVersion === 1 ? parsed : emptyCache();
  } catch {
    return emptyCache();
  }
}

export async function writeCache(
  cachePath: string,
  cache: VisualQaCache,
): Promise<void> {
  cache.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function collectCodeState(
  projectRoot: string,
  baseRef = "HEAD",
): Promise<VisualQaCache["code"]> {
  const repositoryRoot =
    (await git(projectRoot, ["rev-parse", "--show-toplevel"])) || projectRoot;
  const revision =
    (await git(repositoryRoot, ["rev-parse", "HEAD"])) || "unknown";
  const changedFiles = [
    ...lines(await git(repositoryRoot, ["diff", "--name-only", baseRef])),
    ...lines(await git(repositoryRoot, ["diff", "--cached", "--name-only", baseRef])),
    ...lines(
      await git(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]),
    ),
  ];
  const uniqueFiles = [...new Set(changedFiles)].sort();
  const fingerprint = createHash("sha256");
  fingerprint.update(revision);
  for (const relativePath of uniqueFiles) {
    fingerprint.update(relativePath);
    try {
      fingerprint.update(await fs.readFile(path.join(repositoryRoot, relativePath)));
    } catch {
      fingerprint.update("<deleted>");
    }
  }
  return {
    revision,
    version: fingerprint.digest("hex"),
    changedFiles: uniqueFiles,
  };
}

function globRegex(pattern: string): RegExp {
  const marker = "__DOUBLE_STAR__";
  const escaped = pattern
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, marker)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(marker, "g"), ".*");
  return new RegExp(`^${escaped}$`);
}

export function changedRegions(
  files: string[],
  regions: ChangedRegionConfig[],
): ChangedRegionConfig[] {
  return regions.filter((region) =>
    region.sourcePatterns.some((pattern) => {
      const matcher = globRegex(pattern);
      return files.some((file) => matcher.test(file));
    }),
  );
}

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createEmbeddingText } from "./embedding-document.js";
import { extractReactComponents } from "./extractors/react.js";
import type { ExtractedComponent } from "./extractors/types.js";
import { extractVueComponents } from "./extractors/vue.js";
import type {
  ComponentIndex,
  ComponentMetadata,
  SourceFileFingerprint,
} from "./types.js";

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
const IGNORED_FILE_PATTERN = /(?:\.test|\.spec|\.stories|\.config|\.d)\.[cm]?[jt]sx?$/i;

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

interface ScanOptions {
  projectRoot: string;
  sourceRoots?: string[];
  sourceSnapshot?: SourceSnapshot;
}

interface SnapshotFile extends SourceFileFingerprint {
  absolutePath: string;
}

export interface SourceSnapshot {
  fingerprint: string;
  files: SnapshotFile[];
}

async function walk(directory: string, projectRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath, projectRoot)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    const relativePath = path.relative(projectRoot, absolutePath);
    if (
      SOURCE_EXTENSIONS.has(extension) &&
      !IGNORED_FILE_PATTERN.test(entry.name) &&
      !relativePath.split(path.sep).some((segment) => IGNORED_DIRECTORIES.has(segment))
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 1);
}

function extractComponents(file: SourceFile): ExtractedComponent[] {
  return path.extname(file.absolutePath).toLowerCase() === ".vue"
    ? extractVueComponents(file.absolutePath, file.content)
    : extractReactComponents(file.absolutePath, file.content);
}

function createExportPath(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.[^.]+$/, "");
  return `./${withoutExtension.split(path.sep).join("/")}`;
}

function countUsages(
  componentName: string,
  ownPath: string,
  files: SourceFile[],
): { usageCount: number; usedBy: string[] } {
  const pattern = new RegExp(`\\b${componentName}\\b`, "g");
  const usedBy: string[] = [];

  for (const file of files) {
    if (file.relativePath === ownPath) {
      continue;
    }
    const matches = file.content.match(pattern)?.length ?? 0;
    if (matches > 0) {
      usedBy.push(file.relativePath.split(path.sep).join("/"));
    }
  }

  return { usageCount: usedBy.length, usedBy: usedBy.slice(0, 10) };
}

async function readProjectName(projectRoot: string): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { name?: string };
    return packageJson.name || path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
}

export async function createSourceSnapshot({
  projectRoot,
  sourceRoots = ["src"],
}: Pick<ScanOptions, "projectRoot" | "sourceRoots">): Promise<SourceSnapshot> {
  const normalizedRoot = path.resolve(projectRoot);
  const absoluteSourceRoots = sourceRoots.map((root) =>
    path.resolve(normalizedRoot, root),
  );
  const sourcePaths = (
    await Promise.all(
      absoluteSourceRoots.map((root) => walk(root, normalizedRoot)),
    )
  ).flat();
  const files = (
    await Promise.all(
      [...new Set(sourcePaths)].sort().map(async (absolutePath) => {
        try {
          const stat = await fs.stat(absolutePath);
          return {
            absolutePath,
            path: path.relative(normalizedRoot, absolutePath).split(path.sep).join("/"),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          } satisfies SnapshotFile;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      }),
    )
  ).filter((file): file is SnapshotFile => file !== null);
  const manifest = files.map(({ path: sourcePath, size, mtimeMs }) => ({
    path: sourcePath,
    size,
    mtimeMs,
  }));

  return {
    fingerprint: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
    files,
  };
}

export async function buildComponentIndex({
  projectRoot,
  sourceRoots = ["src"],
  sourceSnapshot,
}: ScanOptions): Promise<ComponentIndex> {
  const normalizedRoot = path.resolve(projectRoot);
  const snapshot =
    sourceSnapshot ??
    (await createSourceSnapshot({ projectRoot: normalizedRoot, sourceRoots }));

  const files: SourceFile[] = await Promise.all(
    snapshot.files.map(async (file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.path,
      content: await fs.readFile(file.absolutePath, "utf8"),
    })),
  );

  const projectName = await readProjectName(normalizedRoot);
  const components: ComponentMetadata[] = [];

  for (const file of files) {
    for (const extracted of extractComponents(file)) {
      const { name } = extracted;
      const { usageCount, usedBy } = countUsages(
        name,
        file.relativePath,
        files,
      );
      const normalizedPath = file.relativePath.split(path.sep).join("/");
      const keywords = [
        ...splitWords(name),
        ...splitWords(normalizedPath),
        ...extracted.props.flatMap((prop) => splitWords(`${prop.name} ${prop.type}`)),
        ...extracted.hooks.flatMap(splitWords),
        ...extracted.renderedElements.flatMap(splitWords),
      ];

      const componentWithoutEmbedding = {
        id: `${projectName}:${normalizedPath}#${name}`,
        name,
        description: extracted.description,
        scope: "project",
        framework: extracted.framework,
        parser: extracted.parser,
        projectName,
        sourcePath: normalizedPath,
        exportPath: createExportPath(file.relativePath),
        exportKind: extracted.exportKind,
        status: extracted.status,
        keywords: [...new Set(keywords)],
        useCases: extracted.useCases,
        props: extracted.props,
        imports: extracted.imports,
        hooks: extracted.hooks,
        renderedElements: extracted.renderedElements,
        sourceSnippet: extracted.sourceSnippet,
        usageCount,
        usedBy,
      } satisfies Omit<ComponentMetadata, "embeddingText">;

      components.push({
        ...componentWithoutEmbedding,
        embeddingText: createEmbeddingText(componentWithoutEmbedding),
      });
    }
  }

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    projectRoot: normalizedRoot,
    projectName,
    sourceRoots,
    sourceFingerprint: snapshot.fingerprint,
    sourceFiles: snapshot.files.map(({ path: sourcePath, size, mtimeMs }) => ({
      path: sourcePath,
      size,
      mtimeMs,
    })),
    components: components.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function writeComponentIndex(
  index: ComponentIndex,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function readComponentIndex(indexPath: string): Promise<ComponentIndex> {
  return JSON.parse(await fs.readFile(indexPath, "utf8")) as ComponentIndex;
}

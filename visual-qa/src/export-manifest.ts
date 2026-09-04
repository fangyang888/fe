import { promises as fs } from "node:fs";
import path from "node:path";
import { hashFile, readCache, writeCache } from "./cache.js";
import type {
  ExportManifest,
  ExportManifestAsset,
  ExportManifestInput,
  IntentLayer,
  IntentPlan,
  IntentPlanRegion,
  RectangleBounds,
} from "./types.js";

export const DEFAULT_EXPORT_FORMAT: ExportManifestAsset["format"] = "png";
export const DEFAULT_EXPORT_SCALE = 3;

export interface ExportManifestWriteOptions {
  reuseAssets?: boolean;
  cachePath?: string;
  baseDirectory?: string;
}

function slug(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function extension(format: ExportManifestAsset["format"]): string {
  return format === "jpeg" ? "jpg" : format;
}

function exportSettings(format: ExportManifestAsset["format"], scale: number) {
  const imageType = { png: 1, jpeg: 2, svg: 3, webp: 8 }[format];
  return { imageType, constraint: { type: 1, value: scale } };
}

function scaledBounds(bounds: RectangleBounds, scale: number): RectangleBounds {
  return {
    x: Math.round(bounds.x * scale),
    y: Math.round(bounds.y * scale),
    width: Math.round(bounds.width * scale),
    height: Math.round(bounds.height * scale),
  };
}

function frameCropOperation(
  sourceNodeId: string,
  format: ExportManifestAsset["format"],
  scale: number,
  bounds: RectangleBounds,
): ExportManifestAsset["operation"] {
  return {
    kind: "pixso-frame-export-crop",
    tool: "get_export_image",
    args: {
      guid: sourceNodeId,
      exportSettings: exportSettings(format, scale),
    },
    crop: scaledBounds(bounds, scale),
  };
}

function createOperation(
  sourceNodeId: string,
  format: ExportManifestAsset["format"],
  scale: number,
  nodeId?: string,
  crop?: RectangleBounds,
): ExportManifestAsset["operation"] {
  if (nodeId) {
    return {
      kind: "pixso-node-export",
      tool: "get_export_image",
      args: { guid: nodeId, exportSettings: exportSettings(format, scale) },
    };
  }
  if (!crop) throw new Error("A mapped design bound is required for frame crop");
  return frameCropOperation(sourceNodeId, format, scale, crop);
}

function dimensionPolicy(
  sourceNodeId: string,
  format: ExportManifestAsset["format"],
  scale: number,
  nodeId: string | undefined,
  bounds: RectangleBounds | undefined,
): ExportManifestAsset["dimensionPolicy"] {
  if (!nodeId || !bounds || format === "svg") return undefined;
  const expected = scaledBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height }, scale);
  return {
    expectedPixelSize: { width: expected.width, height: expected.height },
    onMismatch: "use-fallback",
    fallback: frameCropOperation(sourceNodeId, format, scale, bounds),
    retain: "final-only",
  };
}

function assetFromRegion(
  region: IntentPlanRegion,
  sourceNodeId: string,
  assetsDir: string,
  format: ExportManifestAsset["format"],
  scale: number,
): ExportManifestAsset | undefined {
  if (!region.nodeId && !region.bounds) return undefined;
  const name = slug(region.name, region.id);
  const asset: ExportManifestAsset = {
    id: region.id,
    regionId: region.id,
    name: region.name,
    role: "single-image",
    file: path.join(assetsDir, `${name}.${extension(format)}`),
    format,
    operation: createOperation(
      sourceNodeId,
      format,
      scale,
      region.nodeId,
      region.bounds,
    ),
  };
  const policy = dimensionPolicy(sourceNodeId, format, scale, region.nodeId, region.bounds);
  if (policy) asset.dimensionPolicy = policy;
  return asset;
}

function assetFromLayer(
  region: IntentPlanRegion,
  layer: IntentLayer,
  index: number,
  sourceNodeId: string,
  assetsDir: string,
  defaultFormat: ExportManifestAsset["format"],
  scale: number,
): ExportManifestAsset | undefined {
  if (!layer.nodeId && !layer.bounds) return undefined;
  const format = layer.format ?? defaultFormat;
  const id = `${region.id}-layer-${index + 1}`;
  const name = slug(layer.name, id);
  const asset: ExportManifestAsset = {
    id,
    regionId: region.id,
    name: layer.name,
    role: layer.role,
    file: path.join(assetsDir, `${name}.${extension(format)}`),
    format,
    operation: createOperation(
      sourceNodeId,
      format,
      scale,
      layer.nodeId,
      layer.bounds,
    ),
  };
  const policy = dimensionPolicy(sourceNodeId, format, scale, layer.nodeId, layer.bounds);
  if (policy) asset.dimensionPolicy = policy;
  return asset;
}

function validatePlan(plan: IntentPlan): void {
  if (plan.schemaVersion !== 1 || plan.kind !== "visual-qa-intent-plan") {
    throw new Error("Unsupported intent plan schema");
  }
  if (!plan.source?.nodeId) throw new Error("plan.source.nodeId is required");
  if (!Array.isArray(plan.regions)) throw new Error("plan.regions must be an array");
}

export function createExportManifest(input: ExportManifestInput): ExportManifest {
  validatePlan(input.plan);
  const assetsDir = input.assetsDir ?? "assets/images";
  const defaultFormat = input.defaultFormat ?? DEFAULT_EXPORT_FORMAT;
  const scale = input.scale ?? DEFAULT_EXPORT_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("scale must be a positive number");
  }

  const exports: ExportManifestAsset[] = [];
  const skipped: ExportManifest["skipped"] = [];
  const ambiguities = [...input.plan.ambiguities];
  for (const region of input.plan.regions) {
    if (region.export === false) {
      skipped.push({ regionId: region.id, name: region.name, reason: "not-used" });
      continue;
    }
    if (region.mode === "dom-text" || region.mode === "ignore" || region.mode === "review") {
      skipped.push({ regionId: region.id, name: region.name, reason: region.mode });
      if (region.mode === "review") {
        ambiguities.push(`${region.id} must be classified before export`);
      }
      continue;
    }
    if (region.mode === "single-image") {
      const asset = assetFromRegion(
        region,
        input.plan.source.nodeId,
        assetsDir,
        region.format ?? defaultFormat,
        scale,
      );
      if (asset) {
        exports.push(asset);
        if (
          region.source !== "item-id" &&
          region.nodeId &&
          asset.format !== "svg" &&
          !asset.dimensionPolicy
        ) {
          ambiguities.push(
            `${region.id} needs mapped design bounds to validate and remove Pixso effect padding`,
          );
        }
      }
      else ambiguities.push(`${region.id} needs a Pixso nodeId or mapped bounds`);
      continue;
    }
    if (!region.layers || region.layers.length < 2) {
      ambiguities.push(`${region.id} needs at least two exportable layers`);
      continue;
    }
    for (const [index, layer] of region.layers.entries()) {
      if (layer.export === false) continue;
      const asset = assetFromLayer(
        region,
        layer,
        index,
        input.plan.source.nodeId,
        assetsDir,
        defaultFormat,
        scale,
      );
      if (asset) {
        exports.push(asset);
        if (layer.nodeId && asset.format !== "svg" && !asset.dimensionPolicy) {
          ambiguities.push(
            `${region.id} layer ${layer.name} needs design bounds to validate and remove Pixso effect padding`,
          );
        }
      }
      else ambiguities.push(`${region.id} layer ${layer.name} needs a nodeId or bounds`);
    }
  }

  const uniqueAmbiguities = [...new Set(ambiguities)];
  return {
    schemaVersion: 1,
    kind: "visual-qa-export-manifest",
    name: input.plan.name,
    generatedAt: new Date().toISOString(),
    status: uniqueAmbiguities.length === 0 ? "ready" : "needs-review",
    source: input.plan.source,
    assetsDir,
    exports,
    skipped,
    ambiguities: uniqueAmbiguities,
  };
}

export async function readIntentPlan(planPath: string): Promise<IntentPlan> {
  return JSON.parse(await fs.readFile(path.resolve(planPath), "utf8")) as IntentPlan;
}

export async function writeExportManifest(
  input: ExportManifestInput,
  outputPath: string,
  options: ExportManifestWriteOptions = {},
): Promise<ExportManifest> {
  const manifest = createExportManifest(input);
  const absoluteOutput = path.resolve(outputPath);
  if (options.reuseAssets) {
    const cachePath = path.resolve(options.cachePath ?? "cache.json");
    const baseDirectory = path.resolve(options.baseDirectory ?? process.cwd());
    const cache = await readCache(cachePath);
    const reusedAssets: string[] = [];
    for (const asset of manifest.exports) {
      const absoluteAsset = path.resolve(baseDirectory, asset.file);
      try {
        const [hash, stats] = await Promise.all([
          hashFile(absoluteAsset),
          fs.stat(absoluteAsset),
        ]);
        const cachedAsset = cache.assets[absoluteAsset];
        const reused = cachedAsset?.hash === hash;
        asset.reuse = { status: reused ? "reuse" : "export", hash };
        if (reused) reusedAssets.push(asset.file);
        cache.assets[absoluteAsset] = {
          hash,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        };
      } catch {
        asset.reuse = { status: "export" };
      }
    }
    manifest.reusedAssets = reusedAssets;
    await writeCache(cachePath, cache);
  }
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(
    absoluteOutput,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

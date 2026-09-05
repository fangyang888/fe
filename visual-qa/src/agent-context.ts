import { promises as fs } from "node:fs";
import path from "node:path";
import { hashFile, hashValue } from "./cache.js";
import { readVisualCase } from "./config.js";
import { summarizeMeasurement } from "./measure.js";
import type {
  ExportManifest,
  IntentPlan,
  RectangleBounds,
  VerificationReport,
} from "./types.js";

export interface AgentContextOptions {
  casePath: string;
  outputPath: string;
  planPath?: string;
  manifestPath?: string;
  reportPath?: string;
}

export interface AgentContextResult {
  status: "created" | "cached";
  outputPath: string;
  cacheKey: string;
}

async function readJson<T>(filePath: string | undefined): Promise<T | undefined> {
  if (!filePath) return undefined;
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8")) as T;
}

export async function writeAgentContext(
  options: AgentContextOptions,
): Promise<AgentContextResult> {
  const casePath = path.resolve(options.casePath);
  const outputPath = path.resolve(options.outputPath);
  const [visualCase, plan, manifest, report] = await Promise.all([
    readVisualCase(casePath),
    readJson<IntentPlan>(options.planPath),
    readJson<ExportManifest>(options.manifestPath),
    readJson<VerificationReport>(options.reportPath),
  ]);
  const designHash = await hashFile(visualCase.designImage);
  const sourceFingerprints = await Promise.all(
    [casePath, options.planPath, options.manifestPath, options.reportPath]
      .filter((value): value is string => Boolean(value))
      .map(async (file) => ({ file: path.resolve(file), hash: await hashFile(file) })),
  );
  const cacheKey = hashValue({ sourceFingerprints, designHash });

  try {
    const existing = JSON.parse(await fs.readFile(outputPath, "utf8")) as {
      cacheKey?: string;
    };
    if (existing.cacheKey === cacheKey) {
      return { status: "cached", outputPath, cacheKey };
    }
  } catch {
    // A missing or invalid context file is a normal cache miss.
  }

  const assetsByRegion = new Map(
    (manifest?.exports ?? []).map((asset) => [asset.regionId, asset]),
  );
  const images = (plan?.regions ?? [])
    .filter((region) => region.mode === "single-image" || region.mode === "layers")
    .map((region) => {
      const asset = assetsByRegion.get(region.id);
      return {
        id: region.id,
        name: region.name,
        mode: region.mode,
        ...(region.nodeId ? { itemId: region.nodeId } : {}),
        ...(region.bounds ? { bounds: region.bounds } : {}),
        ...(region.selector ? { selector: region.selector } : {}),
        ...(asset ? { asset: asset.file } : {}),
      };
    });
  const differenceRegions: RectangleBounds[] =
    report?.comparison.differenceRegions.slice(0, 2).map(
      ({ x, y, width, height }) => ({ x, y, width, height }),
    ) ?? [];
  const context = {
    schemaVersion: 1,
    kind: "visual-qa-agent-context",
    cacheKey,
    generatedAt: new Date().toISOString(),
    source: {
      designUrl: plan?.source.designUrl,
      nodeId: visualCase.pixsoNodeId ?? plan?.source.nodeId,
      nodeVersion: visualCase.pixsoNodeVersion,
      designImage: visualCase.designImage,
      designHash,
    },
    viewport: visualCase.viewport,
    contract: visualCase.contract,
    images,
    unresolvedIntentCount: plan?.ambiguities.length ?? 0,
    rules: {
      scopeSelector: visualCase.cssRules?.scopeSelector,
      pageShellSelector: visualCase.cssRules?.pageShellSelector,
      positionContextMaxDepth: visualCase.cssRules?.positionContextMaxDepth,
      preferResponsivePage: visualCase.cssRules?.preferResponsivePage,
    },
    ...(report
      ? {
          verification: {
            status: report.status,
            measurement: summarizeMeasurement(report.capture.measurement),
            mode: report.mode,
            mismatchPercent: report.comparison.mismatchPercent,
            ssim: report.comparison.ssim,
            differenceRegions,
            css: report.capture.cssRules?.counts,
            diagnosticCrops: report.artifacts.diagnosticCrops,
            timings: report.timings,
          },
        }
      : {}),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  return { status: "created", outputPath, cacheKey };
}

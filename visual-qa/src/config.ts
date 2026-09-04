import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ChangeDetectionConfig,
  CssRulesConfig,
  ImageElementIntent,
  OverlayImageIntent,
  VisualCase,
  VisualRegionIntent,
  VisualStructureIntent,
  VisualThresholds,
} from "./types.js";

export const DEFAULT_THRESHOLDS: Required<VisualThresholds> = {
  pixelThreshold: 0.1,
  maxMismatchPercent: 1.5,
  minSsim: 0.98,
};

function requirePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeImageIntent(
  input: ImageElementIntent,
  name: string,
): ImageElementIntent {
  return {
    selector: requireText(input?.selector, `${name}.selector`),
    requireNoVisibleChildren: input.requireNoVisibleChildren ?? true,
  };
}

function normalizeOverlay(
  input: OverlayImageIntent,
  name: string,
): OverlayImageIntent {
  return {
    ...normalizeImageIntent(input, name),
    name: requireText(input?.name, `${name}.name`),
    mustOverlap: input.mustOverlap ?? true,
    mustOverflowBase: input.mustOverflowBase ?? false,
    mustBeAboveBase: input.mustBeAboveBase ?? true,
  };
}

function normalizeRegion(
  input: VisualRegionIntent,
  index: number,
): VisualRegionIntent {
  const pathName = `structure.regions[${index}]`;
  const name = requireText(input?.name, `${pathName}.name`);
  if (input.type === "single-image") {
    return {
      ...normalizeImageIntent(input, pathName),
      name,
      type: input.type,
    };
  }
  if (input.type === "composite-image") {
    if (!Array.isArray(input.overlays) || input.overlays.length === 0) {
      throw new Error(`${pathName}.overlays must contain at least one overlay`);
    }
    return {
      name,
      type: input.type,
      selector: requireText(input.selector, `${pathName}.selector`),
      base: normalizeImageIntent(input.base, `${pathName}.base`),
      overlays: input.overlays.map((overlay, overlayIndex) =>
        normalizeOverlay(overlay, `${pathName}.overlays[${overlayIndex}]`),
      ),
    };
  }
  throw new Error(
    `${pathName}.type must be "single-image" or "composite-image"`,
  );
}

function normalizeStructure(
  input: VisualStructureIntent | undefined,
): VisualStructureIntent | undefined {
  if (!input) return undefined;
  if (!Array.isArray(input.regions) || input.regions.length === 0) {
    throw new Error("structure.regions must contain at least one region");
  }
  return {
    failOnMismatch: input.failOnMismatch ?? true,
    regions: input.regions.map(normalizeRegion),
  };
}

function normalizeCssRules(
  input: CssRulesConfig | undefined,
): Required<CssRulesConfig> {
  const ignoreSelectors = input?.ignoreSelectors ?? [];
  if (!Array.isArray(ignoreSelectors)) {
    throw new Error("cssRules.ignoreSelectors must be an array");
  }
  const positionContextMaxDepth = input?.positionContextMaxDepth ?? 2;
  if (
    !Number.isInteger(positionContextMaxDepth) ||
    positionContextMaxDepth <= 0
  ) {
    throw new Error("cssRules.positionContextMaxDepth must be a positive integer");
  }
  const failOnSeverity = input?.failOnSeverity ?? "error";
  if (failOnSeverity !== "error" && failOnSeverity !== "warning") {
    throw new Error('cssRules.failOnSeverity must be "error" or "warning"');
  }
  return {
    preferFlex: input?.preferFlex ?? true,
    allowGap: input?.allowGap ?? false,
    preferResponsivePage: input?.preferResponsivePage ?? true,
    rejectSuspiciousCss: input?.rejectSuspiciousCss ?? true,
    failOnMismatch: input?.failOnMismatch ?? true,
    failOnSeverity,
    scopeSelector: requireText(
      input?.scopeSelector ?? "body",
      "cssRules.scopeSelector",
    ),
    pageShellSelector: requireText(
      input?.pageShellSelector ?? ":scope > :first-child",
      "cssRules.pageShellSelector",
    ),
    positionContextMaxDepth,
    ignoreSelectors: ignoreSelectors.map((selector, index) =>
      requireText(selector, `cssRules.ignoreSelectors[${index}]`),
    ),
  };
}

function normalizeChangeDetection(
  input: ChangeDetectionConfig | undefined,
  baseDirectory: string,
): ChangeDetectionConfig | undefined {
  if (!input) return undefined;
  if (!Array.isArray(input.regions) || input.regions.length === 0) {
    throw new Error("changeDetection.regions must contain at least one region");
  }
  return {
    projectRoot: path.resolve(baseDirectory, input.projectRoot ?? "."),
    baseRef: requireText(input.baseRef ?? "HEAD", "changeDetection.baseRef"),
    regions: input.regions.map((region, index) => {
      const name = `changeDetection.regions[${index}]`;
      if (
        !region.bounds ||
        !Number.isFinite(region.bounds.x) ||
        !Number.isFinite(region.bounds.y)
      ) {
        throw new Error(`${name}.bounds.x and ${name}.bounds.y must be finite numbers`);
      }
      const sourcePatterns = region.sourcePatterns;
      if (!Array.isArray(sourcePatterns) || sourcePatterns.length === 0) {
        throw new Error(`${name}.sourcePatterns must contain at least one pattern`);
      }
      return {
        name: requireText(region.name, `${name}.name`),
        bounds: {
          x: region.bounds.x,
          y: region.bounds.y,
          width: requirePositiveNumber(region.bounds.width, `${name}.bounds.width`),
          height: requirePositiveNumber(region.bounds.height, `${name}.bounds.height`),
        },
        sourcePatterns: sourcePatterns.map((pattern, patternIndex) =>
          requireText(pattern, `${name}.sourcePatterns[${patternIndex}]`),
        ),
      };
    }),
  };
}

export function normalizeVisualCase(
  input: VisualCase,
  configPath: string,
): VisualCase {
  if (!input.name?.trim()) throw new Error("case.name is required");
  if (!input.url?.trim()) throw new Error("case.url is required");
  if (!input.designImage?.trim()) throw new Error("case.designImage is required");

  const baseDirectory = path.dirname(path.resolve(configPath));
  const width = requirePositiveNumber(input.viewport?.width, "viewport.width");
  const height = requirePositiveNumber(input.viewport?.height, "viewport.height");
  const deviceScaleFactor = input.viewport.deviceScaleFactor ?? 1;
  requirePositiveNumber(deviceScaleFactor, "viewport.deviceScaleFactor");

  return {
    ...input,
    name: input.name.trim(),
    designImage: path.resolve(baseDirectory, input.designImage),
    outputDir: path.resolve(
      baseDirectory,
      input.outputDir ?? `./artifacts/${input.name}`,
    ),
    viewport: { width, height, deviceScaleFactor },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...input.thresholds,
    },
    wait: {
      timeoutMs: 15_000,
      networkIdle: true,
      stableFrames: 3,
      ...input.wait,
    },
    locale: input.locale ?? "zh-CN",
    timezoneId: input.timezoneId ?? "Asia/Shanghai",
    colorScheme: input.colorScheme ?? "light",
    browserChannel: input.browserChannel ?? "chrome",
    fullPage: input.fullPage ?? false,
    structure: normalizeStructure(input.structure),
    cssRules: normalizeCssRules(input.cssRules),
    changeDetection: normalizeChangeDetection(
      input.changeDetection,
      baseDirectory,
    ),
  };
}

export async function readVisualCase(configPath: string): Promise<VisualCase> {
  const content = await fs.readFile(path.resolve(configPath), "utf8");
  return normalizeVisualCase(JSON.parse(content) as VisualCase, configPath);
}

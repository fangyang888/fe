import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeContract } from "./measure.js";
import type {
  ChangeDetectionConfig,
  CriticalRegion,
  CssRulesConfig,
  ImageElementIntent,
  OverlayImageIntent,
  VisualCase,
  HarmonyCase,
  PlatformCase,
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
    preferRem: input?.preferRem ?? false,
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

function normalizeCriticalRegions(input: CriticalRegion[] | undefined): CriticalRegion[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length > 16) throw new Error("criticalRegions must be an array of at most 16 regions");
  const names = new Set<string>();
  return input.map((region, index) => {
    const name = requireText(region?.name, `criticalRegions[${index}].name`);
    if (names.has(name)) throw new Error(`Duplicate critical region: ${name}`);
    names.add(name);
    const bounds = region.bounds;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger) ||
      bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0) throw new Error(`Invalid critical region ${name} bounds`);
    for (const [key, max] of [["pixelThreshold", 1], ["maxMismatchPercent", 100], ["minSsim", 1]] as const) {
      const value = region.thresholds?.[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > max)) throw new Error(`Invalid critical region ${name} ${key}`);
    }
    return { name, bounds: { ...bounds }, ...(region.thresholds ? { thresholds: { ...region.thresholds } } : {}) };
  });
}

export function normalizeVisualCase(input: VisualCase, configPath: string): VisualCase;
export function normalizeVisualCase(input: HarmonyCase, configPath: string): HarmonyCase;
export function normalizeVisualCase(input: PlatformCase, configPath: string): PlatformCase;
export function normalizeVisualCase(input: PlatformCase, configPath: string): PlatformCase {
  if (input.platform === "harmony") return normalizeHarmonyCase(input, configPath);
  if (input.platform !== undefined && input.platform !== "web") throw new Error("platform must be web or harmony");
  if (!input.name?.trim()) throw new Error("case.name is required");
  if (!input.url?.trim()) throw new Error("case.url is required");
  if (!input.designImage?.trim()) throw new Error("case.designImage is required");
  if (input.styleOverrides !== undefined && typeof input.styleOverrides !== "string") {
    throw new Error("case.styleOverrides must be a string");
  }

  const baseDirectory = path.dirname(path.resolve(configPath));
  const width = requirePositiveNumber(input.viewport?.width, "viewport.width");
  const height = requirePositiveNumber(input.viewport?.height, "viewport.height");
  const deviceScaleFactor = input.viewport.deviceScaleFactor ?? 1;
  requirePositiveNumber(deviceScaleFactor, "viewport.deviceScaleFactor");

  return {
    ...input,
    name: input.name.trim(),
    criticalRegions: normalizeCriticalRegions(input.criticalRegions),
    ...(input.contract ? { contract: normalizeContract(input.contract) } : {}),
    ...(input.intentPlan
      ? {
          intentPlan: path.resolve(
            baseDirectory,
            requireText(input.intentPlan, "case.intentPlan"),
          ),
        }
      : {}),
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

export async function readVisualCase(configPath: string): Promise<PlatformCase> {
  const content = await fs.readFile(path.resolve(configPath), "utf8");
  return normalizeVisualCase(JSON.parse(content) as PlatformCase, configPath);
}

function normalizeHarmonyCase(input: HarmonyCase, configPath: string): HarmonyCase {
  const base = path.dirname(path.resolve(configPath));
  const name = requireText(input.name, "case.name");
  const designImage = path.resolve(base, requireText(input.designImage, "case.designImage"));
  for (const field of ["url", "viewport", "contract", "structure", "intentPlan", "cssRules", "wait", "browserChannel", "fullPage", "changeDetection", "locale", "timezoneId", "colorScheme"] as const) {
    if (input[field] !== undefined) throw new Error(`Harmony does not support case.${field}; use native screenshot configuration`);
  }
  const h = input.harmony;
  if (!h || typeof h !== "object" || Array.isArray(h)) throw new Error("case.harmony is required");
  const navigation = h.navigation ?? "manual";
  if (!["manual", "configured", "computer-use"].includes(navigation)) throw new Error("Invalid harmony.navigation");
  const deviceId = requireText(h.deviceId ?? "auto", "harmony.deviceId");
  if (!/^[a-zA-Z0-9_.:[\]-]+$/.test(deviceId) || deviceId.startsWith("-")) throw new Error("Invalid harmony.deviceId");
  const capture = h.capture ?? { scope: "screen" as const };
  if (!["screen", "region"].includes(capture.scope)) throw new Error("Invalid harmony.capture.scope");
  if (capture.scope === "region") {
    const r = capture.region;
    if (!r || ![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0) throw new Error("Harmony capture.region requires nonnegative integer x/y and positive integer width/height in raw pixels");
  } else if (capture.region !== undefined) throw new Error("capture.region requires scope=region");
  for (const key of ["bundleName", "abilityName"] as const) {
    if (h[key] !== undefined && !/^[a-zA-Z0-9_][a-zA-Z0-9_.]*$/.test(h[key]!)) throw new Error(`Invalid harmony.${key}`);
  }
  if (navigation === "configured" && (!h.bundleName || !h.abilityName)) throw new Error("configured navigation requires bundleName and abilityName");
  if (h.screenshot && navigation !== "manual") throw new Error("Imported screenshots require navigation=manual; no navigation is executed");
  const bounded = (value: number | undefined, fallback: number, min: number, max: number, field: string) => {
    const n = value ?? fallback;
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${field} must be an integer between ${min} and ${max}`);
    return n;
  };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  for (const [key, max] of [["pixelThreshold", 1], ["maxMismatchPercent", 100], ["minSsim", 1]] as const) {
    const n = thresholds[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) throw new Error(`Invalid thresholds.${key}`);
  }
  return {
    ...input, name, designImage, thresholds,
    outputDir: path.resolve(base, input.outputDir ?? `./artifacts/${name}`),
    harmony: {
      ...h, deviceId, navigation, capture,
      hdcPath: h.hdcPath === undefined ? "hdc" : (() => {
        const executable = requireText(h.hdcPath, "harmony.hdcPath");
        return /[\\/]/.test(executable) ? path.resolve(base, executable) : executable;
      })(),
      ...(h.screenshot !== undefined ? { screenshot: path.resolve(base, requireText(h.screenshot, "harmony.screenshot")) } : {}),
      timeoutMs: bounded(h.timeoutMs, 15000, 100, 60000, "harmony.timeoutMs"),
      stableSamples: bounded(h.stableSamples, 2, 2, 10, "harmony.stableSamples"),
      sampleIntervalMs: bounded(h.sampleIntervalMs, 500, 50, 5000, "harmony.sampleIntervalMs"),
    },
  };
}

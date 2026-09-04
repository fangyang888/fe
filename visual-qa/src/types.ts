export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface WaitConfig {
  selector?: string;
  readyExpression?: string;
  timeoutMs?: number;
  networkIdle?: boolean;
  stableFrames?: number;
}

export interface VisualThresholds {
  pixelThreshold?: number;
  maxMismatchPercent?: number;
  minSsim?: number;
}

export interface CssRulesConfig {
  preferFlex?: boolean;
  allowGap?: boolean;
  preferResponsivePage?: boolean;
  rejectSuspiciousCss?: boolean;
  failOnMismatch?: boolean;
  failOnSeverity?: "error" | "warning";
  scopeSelector?: string;
  pageShellSelector?: string;
  positionContextMaxDepth?: number;
  ignoreSelectors?: string[];
}

export interface RectangleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChangedRegionConfig {
  name: string;
  bounds: RectangleBounds;
  sourcePatterns: string[];
}

export interface ChangeDetectionConfig {
  projectRoot?: string;
  baseRef?: string;
  regions: ChangedRegionConfig[];
}

export type DesignIntentMode =
  | "single-image"
  | "layers"
  | "dom-text"
  | "ignore"
  | "review";

export interface IntentLayer {
  name: string;
  role: "base-image" | "overlay-image";
  export?: boolean;
  nodeId?: string;
  bounds?: RectangleBounds;
  format?: "png" | "jpeg" | "svg" | "webp";
}

export interface IntentRegionHint {
  order: number;
  name: string;
  mode: DesignIntentMode;
  export?: boolean;
  nodeId?: string;
  bounds?: RectangleBounds;
  selector?: string;
  format?: "png" | "jpeg" | "svg" | "webp";
  layers?: IntentLayer[];
  note?: string;
}

export interface IntentImageItem {
  itemId: string;
  name?: string;
  bounds?: RectangleBounds;
  selector?: string;
  format?: "png" | "jpeg" | "svg" | "webp";
  note?: string;
}

export type IntentImageItemInput = string | IntentImageItem;

export interface IntentDetectionConfig {
  redMin?: number;
  greenMax?: number;
  blueMax?: number;
  dominance?: number;
  colorTolerance?: number;
  minWidth?: number;
  minHeight?: number;
  minEdgeCoverage?: number;
}

export interface IntentPlanInput {
  name: string;
  designUrl?: string;
  sourceNodeId: string;
  annotatedImage?: string;
  referenceImage?: string;
  viewport?: { width: number; height: number };
  frameBounds?: RectangleBounds;
  items?: IntentImageItemInput[];
  hints?: IntentRegionHint[];
  detection?: IntentDetectionConfig;
}

export interface IntentPlanRegion {
  id: string;
  order: number;
  name: string;
  mode: DesignIntentMode;
  source?: "item-id" | "red-frame";
  annotationBounds?: RectangleBounds;
  bounds?: RectangleBounds;
  borderWidth: number;
  confidence: number;
  export?: boolean;
  nodeId?: string;
  selector?: string;
  format?: "png" | "jpeg" | "svg" | "webp";
  layers?: IntentLayer[];
  note?: string;
}

export interface IntentPlan {
  schemaVersion: 1;
  kind: "visual-qa-intent-plan";
  name: string;
  generatedAt: string;
  status: "ready" | "needs-review";
  source: {
    provider: "pixso";
    designUrl?: string;
    nodeId: string;
    annotatedImage?: string;
    referenceImage?: string;
    imageSize?: { width: number; height: number };
    viewport?: { width: number; height: number };
    frameBounds?: RectangleBounds;
  };
  regions: IntentPlanRegion[];
  ambiguities: string[];
}

export interface ExportManifestInput {
  plan: IntentPlan;
  assetsDir?: string;
  defaultFormat?: "png" | "jpeg" | "svg" | "webp";
  scale?: number;
}

export interface ExportOperation {
  kind: "pixso-node-export" | "pixso-frame-export-crop";
  tool: "get_export_image";
  args: Record<string, unknown>;
  crop?: RectangleBounds;
}

export interface ExportDimensionPolicy {
  expectedPixelSize: { width: number; height: number };
  onMismatch: "use-fallback";
  fallback: ExportOperation;
  retain: "final-only";
}

export interface ExportManifestAsset {
  id: string;
  regionId: string;
  name: string;
  role: "single-image" | "base-image" | "overlay-image";
  file: string;
  format: "png" | "jpeg" | "svg" | "webp";
  operation: ExportOperation;
  dimensionPolicy?: ExportDimensionPolicy;
  reuse?: {
    status: "export" | "reuse";
    hash?: string;
  };
}

export interface ExportManifest {
  schemaVersion: 1;
  kind: "visual-qa-export-manifest";
  name: string;
  generatedAt: string;
  status: "ready" | "needs-review";
  source: IntentPlan["source"];
  assetsDir: string;
  exports: ExportManifestAsset[];
  skipped: Array<{
    regionId: string;
    name: string;
    reason: "dom-text" | "ignore" | "review" | "not-used";
  }>;
  reusedAssets?: string[];
  ambiguities: string[];
}

export interface ImageElementIntent {
  selector: string;
  requireNoVisibleChildren?: boolean;
}

export interface OverlayImageIntent extends ImageElementIntent {
  name: string;
  mustOverlap?: boolean;
  mustOverflowBase?: boolean;
  mustBeAboveBase?: boolean;
}

export interface SingleImageRegionIntent extends ImageElementIntent {
  name: string;
  type: "single-image";
}

export interface CompositeImageRegionIntent {
  name: string;
  type: "composite-image";
  selector: string;
  base: ImageElementIntent;
  overlays: OverlayImageIntent[];
}

export type VisualRegionIntent =
  | SingleImageRegionIntent
  | CompositeImageRegionIntent;

export interface VisualStructureIntent {
  failOnMismatch?: boolean;
  regions: VisualRegionIntent[];
}

export interface VisualCase {
  name: string;
  pixsoNodeId?: string;
  pixsoNodeVersion?: string;
  designImage: string;
  url: string;
  outputDir?: string;
  viewport: ViewportConfig;
  wait?: WaitConfig;
  thresholds?: VisualThresholds;
  locale?: string;
  timezoneId?: string;
  colorScheme?: "light" | "dark";
  browserChannel?: "chromium" | "chrome" | "msedge";
  fullPage?: boolean;
  structure?: VisualStructureIntent;
  cssRules?: CssRulesConfig;
  changeDetection?: ChangeDetectionConfig;
}

export interface StructureCheckResult {
  check: string;
  passed: boolean;
  message: string;
}

export interface StructureRegionResult {
  name: string;
  type: VisualRegionIntent["type"];
  passed: boolean;
  checks: StructureCheckResult[];
}

export interface StructureInspectionResult {
  passed: boolean;
  failOnMismatch: boolean;
  regions: StructureRegionResult[];
}

export interface CssRuleViolation {
  rule:
    | "prefer-flex"
    | "no-gap"
    | "responsive-page-size"
    | "page-shell"
    | "absolute-position-context"
    | "suspicious-css";
  severity: "error" | "warning" | "info";
  selector: string;
  display: string;
  rowGap: string;
  columnGap: string;
  property?: string;
  value?: string;
  message: string;
}

export interface CssRulesInspectionResult {
  passed: boolean;
  failOnMismatch: boolean;
  failOnSeverity: "error" | "warning";
  preferFlex: boolean;
  allowGap: boolean;
  preferResponsivePage: boolean;
  rejectSuspiciousCss: boolean;
  scopeSelector: string;
  pageShellSelector: string;
  positionContextMaxDepth: number;
  counts: Record<"error" | "warning" | "info", number>;
  violations: CssRuleViolation[];
}

export interface CaptureResult {
  url: string;
  title: string;
  outputPath: string;
  viewport: Required<ViewportConfig>;
  readiness: {
    fontsReady: boolean;
    imagesTotal: number;
    imagesFailed: string[];
    layoutStable: boolean;
    timings: {
      networkIdleMs: number;
      selectorMs: number;
      readyExpressionMs: number;
      fontsMs: number;
      imagesMs: number;
      layoutMs: number;
      totalMs: number;
      networkIdleSkipped: boolean;
    };
  };
  timings: {
    browserMode: "launched" | "shared" | "connected";
    browserAcquireMs: number;
    contextSetupMs: number;
    navigationMs: number;
    readinessMs: number;
    structureMs: number;
    cssRulesMs: number;
    screenshotMs: number;
    totalMs: number;
  };
  consoleErrors: string[];
  structure?: StructureInspectionResult;
  cssRules?: CssRulesInspectionResult;
}

export interface ComparisonResult {
  expectedPath: string;
  actualPath: string;
  diffPath: string;
  width: number;
  height: number;
  mismatchPixels: number;
  mismatchPercent: number;
  ssim: number | null;
  passed: boolean;
  thresholds: Required<VisualThresholds>;
  comparedRegions?: RectangleBounds[];
  differenceRegions: DifferenceRegion[];
  timings: {
    readMs: number;
    compareMs: number;
    differenceRegionsMs: number;
    writeMs: number;
    totalMs: number;
  };
}

export interface DifferenceRegion extends RectangleBounds {
  mismatchPixels: number;
  mismatchPercent: number;
}

export interface VerificationOptions {
  mode?: "quick" | "agent" | "final";
  reuseVerification?: boolean;
  browser?: import("playwright").Browser;
  browserEndpoint?: string;
  changedOnly?: boolean;
  topRegions?: number;
  reuseDesign?: boolean;
  noAiOnPass?: boolean;
  cachePath?: string;
  projectRoot?: string;
}

export interface VerificationReport {
  schemaVersion: 1;
  name: string;
  pixsoNodeId?: string;
  generatedAt: string;
  status: "passed" | "failed";
  mode: "quick" | "agent" | "final";
  capture: CaptureResult;
  comparison: ComparisonResult;
  changedOnly?: {
    requested: boolean;
    applied: boolean;
    changedFiles: string[];
    regions: string[];
    reason?: string;
  };
  cache: {
    path: string;
    designReused: boolean;
    verificationReused: boolean;
    designHash: string;
    codeVersion: string;
  };
  ai: {
    shouldAnalyze: boolean;
    skipped: boolean;
    reason: string;
    diagnosticCrops?: string[];
    cropLayout?: "expected-left-actual-right";
  };
  artifacts: {
    design: string;
    actual: string;
    diff: string;
    report: string;
    diagnosticCrops?: string[];
  };
  timings: {
    codeStateMs: number;
    cacheLookupMs: number;
    captureMs: number;
    comparisonMs: number;
    diagnosticCropsMs: number;
    persistMs: number;
    totalMs: number;
  };
}

export interface VisualQaCache {
  schemaVersion: 1;
  updatedAt: string;
  designs: Record<
    string,
    {
      nodeId?: string;
      nodeVersion?: string;
      file: string;
      hash: string;
    }
  >;
  assets: Record<
    string,
    {
      hash: string;
      size: number;
      modifiedAt: number;
    }
  >;
  code: {
    revision: string;
    version: string;
    changedFiles: string[];
  };
  verifications: Record<
    string,
    {
      status: "passed" | "failed";
      designHash: string;
      codeVersion: string;
      caseHash?: string;
      mode?: "quick" | "agent" | "final";
      report: string;
    }
  >;
}

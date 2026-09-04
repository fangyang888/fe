import { promises as fs } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type {
  IntentDetectionConfig,
  IntentImageItem,
  IntentImageItemInput,
  IntentPlan,
  IntentPlanInput,
  IntentPlanRegion,
  IntentRegionHint,
  RectangleBounds,
} from "./types.js";

interface DetectedRectangle {
  bounds: RectangleBounds;
  contentBounds: RectangleBounds;
  borderWidth: number;
  confidence: number;
}

interface VerticalBand {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

const DEFAULT_DETECTION: Required<IntentDetectionConfig> = {
  redMin: 220,
  greenMax: 150,
  blueMax: 150,
  dominance: 70,
  colorTolerance: 12,
  minWidth: 16,
  minHeight: 12,
  minEdgeCoverage: 0.55,
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function validateBounds(bounds: RectangleBounds, name: string): RectangleBounds {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    throw new Error(`${name}.x and ${name}.y must be finite numbers`);
  }
  positive(bounds.width, `${name}.width`);
  positive(bounds.height, `${name}.height`);
  return bounds;
}

function pixelIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function buildRedMask(
  image: PNG,
  config: Required<IntentDetectionConfig>,
): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  const candidates = new Map<number, number>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    const alpha = image.data[offset + 3] ?? 0;
    if (
      alpha > 32 &&
      red >= config.redMin &&
      green <= config.greenMax &&
      blue <= config.blueMax &&
      red - Math.max(green, blue) >= config.dominance
    ) {
      const color = (red << 16) | (green << 8) | blue;
      candidates.set(color, (candidates.get(color) ?? 0) + 1);
    }
  }
  const dominant = [...candidates.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  if (dominant === undefined) return mask;
  const targetRed = (dominant >> 16) & 255;
  const targetGreen = (dominant >> 8) & 255;
  const targetBlue = dominant & 255;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = pixelIndex(image.width, x, y);
      const red = image.data[offset] ?? 0;
      const green = image.data[offset + 1] ?? 0;
      const blue = image.data[offset + 2] ?? 0;
      const alpha = image.data[offset + 3] ?? 0;
      if (
        alpha > 32 &&
        red >= config.redMin &&
        green <= config.greenMax &&
        blue <= config.blueMax &&
        red - Math.max(green, blue) >= config.dominance &&
        Math.abs(red - targetRed) <= config.colorTolerance &&
        Math.abs(green - targetGreen) <= config.colorTolerance &&
        Math.abs(blue - targetBlue) <= config.colorTolerance
      ) {
        mask[y * image.width + x] = 1;
      }
    }
  }
  return mask;
}

function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): Array<{ bounds: RectangleBounds; pixels: Array<[number, number]> }> {
  const visited = new Uint8Array(mask.length);
  const components: Array<{
    bounds: RectangleBounds;
    pixels: Array<[number, number]>;
  }> = [];
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    const pixels: Array<[number, number]> = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push([x, y]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const [dx, dy] of offsets) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue;
        }
        const next = nextY * width + nextX;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push({
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
      pixels,
    });
  }
  return components;
}

function edgeCoverage(
  pixelSet: Set<number>,
  bounds: RectangleBounds,
  imageWidth: number,
): { top: number; right: number; bottom: number; left: number } {
  const band = Math.max(2, Math.min(8, Math.floor(Math.min(bounds.width, bounds.height) / 4)));
  let top = 0;
  let bottom = 0;
  for (let offset = 0; offset < band; offset += 1) {
    let topCount = 0;
    let bottomCount = 0;
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (pixelSet.has((bounds.y + offset) * imageWidth + x)) topCount += 1;
      if (
        pixelSet.has(
          (bounds.y + bounds.height - 1 - offset) * imageWidth + x,
        )
      ) {
        bottomCount += 1;
      }
    }
    top = Math.max(top, topCount / bounds.width);
    bottom = Math.max(bottom, bottomCount / bounds.width);
  }

  let left = 0;
  let right = 0;
  for (let offset = 0; offset < band; offset += 1) {
    let leftCount = 0;
    let rightCount = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      if (pixelSet.has(y * imageWidth + bounds.x + offset)) leftCount += 1;
      if (
        pixelSet.has(
          y * imageWidth + bounds.x + bounds.width - 1 - offset,
        )
      ) {
        rightCount += 1;
      }
    }
    left = Math.max(left, leftCount / bounds.height);
    right = Math.max(right, rightCount / bounds.height);
  }
  return { top, right, bottom, left };
}

function estimateBorderWidth(
  mask: Uint8Array,
  imageWidth: number,
  bounds: RectangleBounds,
): number {
  const centerX = Math.round(bounds.x + bounds.width / 2);
  const centerY = Math.round(bounds.y + bounds.height / 2);
  const runs: number[] = [];
  const countRun = (startX: number, startY: number, dx: number, dy: number) => {
    let count = 0;
    let x = startX;
    let y = startY;
    while (
      x >= bounds.x &&
      y >= bounds.y &&
      x < bounds.x + bounds.width &&
      y < bounds.y + bounds.height &&
      mask[y * imageWidth + x]
    ) {
      count += 1;
      x += dx;
      y += dy;
    }
    if (count > 0) runs.push(count);
  };
  countRun(centerX, bounds.y, 0, 1);
  countRun(centerX, bounds.y + bounds.height - 1, 0, -1);
  countRun(bounds.x, centerY, 1, 0);
  countRun(bounds.x + bounds.width - 1, centerY, -1, 0);
  runs.sort((left, right) => left - right);
  return Math.max(1, Math.min(8, runs[Math.floor(runs.length / 2)] ?? 1));
}

function findVerticalBands(
  mask: Uint8Array,
  width: number,
  height: number,
  minHeight: number,
): VerticalBand[] {
  const raw: VerticalBand[] = [];
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      while (y < height && !mask[y * width + x]) y += 1;
      const yStart = y;
      while (y < height && mask[y * width + x]) y += 1;
      if (y - yStart >= minHeight) {
        raw.push({ xStart: x, xEnd: x, yStart, yEnd: y - 1 });
      }
    }
  }

  const bands: VerticalBand[] = [];
  for (const line of raw) {
    const previous = bands[bands.length - 1];
    if (
      previous &&
      line.xStart === previous.xEnd + 1 &&
      Math.abs(line.yStart - previous.yStart) <= 3 &&
      Math.abs(line.yEnd - previous.yEnd) <= 3
    ) {
      previous.xEnd = line.xEnd;
      previous.yStart = Math.min(previous.yStart, line.yStart);
      previous.yEnd = Math.max(previous.yEnd, line.yEnd);
    } else {
      bands.push({ ...line });
    }
  }
  return bands;
}

function boundsSimilarity(left: RectangleBounds, right: RectangleBounds): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function detectFromVerticalEdges(
  mask: Uint8Array,
  width: number,
  height: number,
  config: Required<IntentDetectionConfig>,
): DetectedRectangle[] {
  const bands = findVerticalBands(mask, width, height, config.minHeight);
  const pixelSet = new Set<number>();
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) pixelSet.add(index);
  }
  const rectangles: DetectedRectangle[] = [];
  for (let leftIndex = 0; leftIndex < bands.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bands.length; rightIndex += 1) {
      const left = bands[leftIndex]!;
      const right = bands[rightIndex]!;
      const rectangleWidth = right.xEnd - left.xStart + 1;
      if (rectangleWidth < config.minWidth) continue;
      if (
        Math.abs(left.yStart - right.yStart) > 4 ||
        Math.abs(left.yEnd - right.yEnd) > 4
      ) {
        continue;
      }
      const y = Math.min(left.yStart, right.yStart);
      const bottom = Math.max(left.yEnd, right.yEnd);
      const bounds = {
        x: left.xStart,
        y,
        width: rectangleWidth,
        height: bottom - y + 1,
      };
      const coverage = edgeCoverage(pixelSet, bounds, width);
      const confidence =
        (coverage.top + coverage.right + coverage.bottom + coverage.left) / 4;
      if (Math.min(...Object.values(coverage)) < config.minEdgeCoverage) continue;
      const borderWidth = estimateBorderWidth(mask, width, bounds);
      if (borderWidth / Math.min(bounds.width, bounds.height) > 0.2) continue;
      rectangles.push({
        bounds,
        contentBounds: {
          x: bounds.x + borderWidth,
          y: bounds.y + borderWidth,
          width: bounds.width - borderWidth * 2,
          height: bounds.height - borderWidth * 2,
        },
        borderWidth,
        confidence: round(confidence),
      });
    }
  }
  return rectangles;
}

export function detectAnnotatedRectangles(
  image: PNG,
  configured: IntentDetectionConfig = {},
): DetectedRectangle[] {
  const config = { ...DEFAULT_DETECTION, ...configured };
  const mask = buildRedMask(image, config);
  const componentRectangles = connectedComponents(mask, image.width, image.height)
    .filter(
      (component) =>
        component.bounds.width >= config.minWidth &&
        component.bounds.height >= config.minHeight,
    )
    .map((component): DetectedRectangle | null => {
      const pixelSet = new Set(
        component.pixels.map(([x, y]) => y * image.width + x),
      );
      const coverage = edgeCoverage(pixelSet, component.bounds, image.width);
      const confidence =
        (coverage.top + coverage.right + coverage.bottom + coverage.left) / 4;
      if (Math.min(...Object.values(coverage)) < config.minEdgeCoverage) {
        return null;
      }
      const borderWidth = estimateBorderWidth(mask, image.width, component.bounds);
      if (
        confidence < Math.max(0.8, config.minEdgeCoverage) ||
        borderWidth / Math.min(component.bounds.width, component.bounds.height) > 0.2
      ) {
        return null;
      }
      const inset = Math.min(
        borderWidth,
        Math.floor((Math.min(component.bounds.width, component.bounds.height) - 1) / 2),
      );
      return {
        bounds: component.bounds,
        contentBounds: {
          x: component.bounds.x + inset,
          y: component.bounds.y + inset,
          width: component.bounds.width - inset * 2,
          height: component.bounds.height - inset * 2,
        },
        borderWidth,
        confidence: round(confidence),
      };
    })
    .filter((rectangle): rectangle is DetectedRectangle => rectangle !== null);
  const edgeRectangles = detectFromVerticalEdges(
    mask,
    image.width,
    image.height,
    config,
  );
  const rectangles: DetectedRectangle[] = [];
  for (const candidate of [...componentRectangles, ...edgeRectangles]) {
    const duplicate = rectangles.find(
      (rectangle) => boundsSimilarity(rectangle.bounds, candidate.bounds) >= 0.88,
    );
    if (!duplicate) rectangles.push(candidate);
    else if (candidate.confidence > duplicate.confidence) {
      Object.assign(duplicate, candidate);
    }
  }
  return rectangles.sort(
    (left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
  );
}

function colorDistance(
  image: PNG,
  pixel: number,
  reference: [number, number, number],
): number {
  const offset = pixel * 4;
  return Math.max(
    Math.abs((image.data[offset] ?? 0) - reference[0]),
    Math.abs((image.data[offset + 1] ?? 0) - reference[1]),
    Math.abs((image.data[offset + 2] ?? 0) - reference[2]),
  );
}

export function inferDesignFrame(
  image: PNG,
  viewport: { width: number; height: number },
): RectangleBounds | undefined {
  const imageRatio = image.width / image.height;
  const viewportRatio = viewport.width / viewport.height;
  if (Math.abs(imageRatio - viewportRatio) / viewportRatio <= 0.02) {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }

  const corners = [
    0,
    image.width - 1,
    (image.height - 1) * image.width,
    image.width * image.height - 1,
  ];
  const reference: [number, number, number] = [0, 0, 0];
  for (const pixel of corners) {
    const offset = pixel * 4;
    reference[0] += image.data[offset] ?? 0;
    reference[1] += image.data[offset + 1] ?? 0;
    reference[2] += image.data[offset + 2] ?? 0;
  }
  reference[0] = Math.round(reference[0] / corners.length);
  reference[1] = Math.round(reference[1] / corners.length);
  reference[2] = Math.round(reference[2] / corners.length);

  const mask = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (colorDistance(image, pixel, reference) > 20) mask[pixel] = 1;
  }
  const candidates = connectedComponents(mask, image.width, image.height)
    .map((component) => component.bounds)
    .filter((bounds) => {
      const ratio = bounds.width / bounds.height;
      const ratioError = Math.abs(ratio - viewportRatio) / viewportRatio;
      return ratioError <= 0.12 && bounds.width * bounds.height >= image.width * image.height * 0.1;
    })
    .sort((left, right) => right.width * right.height - left.width * left.height);
  return candidates[0];
}

function mapBounds(
  bounds: RectangleBounds,
  frame: RectangleBounds,
  viewport: { width: number; height: number },
): RectangleBounds {
  return {
    x: round(((bounds.x - frame.x) / frame.width) * viewport.width),
    y: round(((bounds.y - frame.y) / frame.height) * viewport.height),
    width: round((bounds.width / frame.width) * viewport.width),
    height: round((bounds.height / frame.height) * viewport.height),
  };
}

function findHint(hints: IntentRegionHint[], order: number): IntentRegionHint | undefined {
  return hints.find((hint) => hint.order === order);
}

function normalizeItem(
  item: IntentImageItemInput,
  index: number,
): IntentImageItem {
  const normalized = typeof item === "string" ? { itemId: item } : item;
  const itemId = normalized.itemId?.trim();
  if (!itemId) throw new Error(`items[${index}].itemId is required`);
  return {
    ...normalized,
    itemId,
    ...(normalized.name?.trim() ? { name: normalized.name.trim() } : {}),
    ...(normalized.bounds
      ? { bounds: validateBounds(normalized.bounds, `items[${index}].bounds`) }
      : {}),
  };
}

function itemName(item: IntentImageItem): string {
  return item.name ?? `item-${item.itemId.replace(/[^a-z0-9]+/gi, "-")}`;
}

export async function createIntentPlan(input: IntentPlanInput): Promise<IntentPlan> {
  if (!input.name?.trim()) throw new Error("name is required");
  if (!input.sourceNodeId?.trim()) throw new Error("sourceNodeId is required");
  const items = (input.items ?? []).map(normalizeItem);
  const duplicateItem = items.find(
    (item, index) => items.findIndex((candidate) => candidate.itemId === item.itemId) !== index,
  );
  if (duplicateItem) throw new Error(`Duplicate item id: ${duplicateItem.itemId}`);
  if (!input.annotatedImage && items.length === 0) {
    throw new Error("Provide at least one items entry or an annotatedImage");
  }
  if (input.viewport) {
    positive(input.viewport.width, "viewport.width");
    positive(input.viewport.height, "viewport.height");
  }
  if (input.annotatedImage && !input.viewport) {
    throw new Error("viewport is required when annotatedImage is provided");
  }

  const annotatedImage = input.annotatedImage
    ? path.resolve(input.annotatedImage)
    : undefined;
  const image = annotatedImage
    ? PNG.sync.read(await fs.readFile(annotatedImage))
    : undefined;
  const frameBounds = image && input.viewport
    ? input.frameBounds
      ? validateBounds(input.frameBounds, "frameBounds")
      : inferDesignFrame(image, input.viewport)
    : undefined;
  const rectangles = image
    ? detectAnnotatedRectangles(image, input.detection)
    : [];
  if (image && rectangles.length === 0 && items.length === 0) {
    throw new Error("No red annotation rectangles were detected");
  }

  const hints = input.hints ?? [];
  const duplicateOrders = hints.filter(
    (hint, index) => hints.findIndex((candidate) => candidate.order === hint.order) !== index,
  );
  if (duplicateOrders.length > 0) {
    throw new Error(`Duplicate hint order: ${duplicateOrders[0]!.order}`);
  }
  const ambiguities: string[] = [];
  if (image && !frameBounds) {
    ambiguities.push(
      "Design frame could not be inferred; provide --frame x,y,width,height to map annotations to Pixso coordinates",
    );
  }

  const itemNodeIds = new Set(items.map((item) => item.itemId));
  const itemRegions: IntentPlanRegion[] = items.map((item, index) => ({
    id: `item-${index + 1}`,
    order: index + 1,
    name: itemName(item),
    mode: "single-image",
    source: "item-id",
    ...(item.bounds ? { bounds: item.bounds } : {}),
    borderWidth: 0,
    confidence: 1,
    nodeId: item.itemId,
    ...(item.selector ? { selector: item.selector } : {}),
    ...(item.format ? { format: item.format } : {}),
    ...(item.note ? { note: item.note } : {}),
  }));

  const redRegions = rectangles.flatMap((rectangle, index): IntentPlanRegion[] => {
    const order = index + 1;
    const hint = findHint(hints, order);
    const mode = hint?.mode ?? "review";
    const referencedNodeIds = [
      hint?.nodeId,
      ...(hint?.layers?.map((layer) => layer.nodeId) ?? []),
    ].filter((nodeId): nodeId is string => Boolean(nodeId));
    if (referencedNodeIds.some((nodeId) => itemNodeIds.has(nodeId))) {
      return [];
    }
    if (!hint) ambiguities.push(`region-${order} needs an implementation intent`);
    if (mode === "layers" && (!hint?.layers || hint.layers.length < 2)) {
      ambiguities.push(`region-${order} uses layers but needs at least two layer definitions`);
    }
    return [{
      id: `region-${order}`,
      order: items.length + order,
      name: hint?.name?.trim() || `region-${order}`,
      mode,
      source: "red-frame",
      annotationBounds: rectangle.bounds,
      ...(hint?.bounds
        ? { bounds: validateBounds(hint.bounds, `hints[${order}].bounds`) }
        : frameBounds && input.viewport
          ? { bounds: mapBounds(rectangle.contentBounds, frameBounds, input.viewport) }
          : {}),
      borderWidth: rectangle.borderWidth,
      confidence: rectangle.confidence,
      ...(hint?.export === false ? { export: false } : {}),
      ...(hint?.nodeId ? { nodeId: hint.nodeId } : {}),
      ...(hint?.selector ? { selector: hint.selector } : {}),
      ...(hint?.format ? { format: hint.format } : {}),
      ...(hint?.layers ? { layers: hint.layers } : {}),
      ...(hint?.note ? { note: hint.note } : {}),
    }];
  });

  const regions = [...itemRegions, ...redRegions];

  for (const hint of hints) {
    if (hint.order < 1 || hint.order > rectangles.length) {
      ambiguities.push(`hint order ${hint.order} does not match a detected region`);
    }
  }

  return {
    schemaVersion: 1,
    kind: "visual-qa-intent-plan",
    name: input.name.trim(),
    generatedAt: new Date().toISOString(),
    status: ambiguities.length === 0 ? "ready" : "needs-review",
    source: {
      provider: "pixso",
      ...(input.designUrl ? { designUrl: input.designUrl } : {}),
      nodeId: input.sourceNodeId.trim(),
      ...(annotatedImage ? { annotatedImage } : {}),
      ...(input.referenceImage
        ? { referenceImage: path.resolve(input.referenceImage) }
        : {}),
      ...(image ? { imageSize: { width: image.width, height: image.height } } : {}),
      ...(input.viewport ? { viewport: input.viewport } : {}),
      ...(frameBounds ? { frameBounds } : {}),
    },
    regions,
    ambiguities,
  };
}

export async function writeIntentPlan(
  input: IntentPlanInput,
  outputPath: string,
): Promise<IntentPlan> {
  const plan = await createIntentPlan(input);
  const absoluteOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

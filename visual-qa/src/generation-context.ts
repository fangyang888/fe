import { promises as fs } from "node:fs";
import path from "node:path";
import type { IntentPlan, IntentPlanRegion } from "./types.js";

type NodeData = Record<string, unknown>;

// Only node-local design properties may enter the generation context. In
// particular, ancestor JSX/CSS/DSL strings can contain opaque descendants.
const DESIGN_FIELDS = [
  "x", "y", "width", "height", "size", "transform", "absoluteBoundingBox",
  "fillPaints", "strokePaints", "strokeWeight", "cornerRadius", "opacity",
  "nodeText", "fontSize", "fontName", "fontWeight", "lineHeight", "letterSpacing",
  "textAlignHorizontal", "textAlignVertical", "layoutMode", "itemSpacing",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "constraints",
  "clipsContent", "isMask", "blendMode", "visible", "zIndex", "layoutPositioning",
] as const;
const BOUNDARY_FIELDS = [
  "x", "y", "width", "height", "size", "transform", "absoluteBoundingBox",
  "constraints", "layoutPositioning", "zIndex", "isMask", "blendMode", "visible",
] as const;

interface NodeHierarchy {
  parentNodeId: string | null;
  ancestorNodeIds: string[];
  sourceSiblingIndex: number;
}

export interface GenerationNode {
  nodeId: string;
  name?: string;
  type?: string;
  representation: "single-image" | "layout";
  hierarchy: NodeHierarchy;
  properties: NodeData;
  regionId?: string;
  selector?: string;
  children?: GenerationNode[];
}

function object(value: unknown, label: string): NodeData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as NodeData;
}

function select(node: NodeData, fields: readonly string[]): NodeData {
  return Object.fromEntries(fields.filter((key) => node[key] !== undefined).map((key) => [key, node[key]]));
}

/** Accept a Pixso node, [node], or {nodes:[node]}, not JSX or MCP text envelopes. */
export function createGenerationContext(plan: IntentPlan, input: unknown) {
  if (plan.kind !== "visual-qa-intent-plan" || plan.schemaVersion !== 1 || !Array.isArray(plan.regions)) {
    throw new Error("Unsupported intent plan schema");
  }
  const issues = [...(plan.ambiguities ?? [])];
  if (plan.status !== "ready") issues.push("Intent plan is not ready");
  // A declared composite stays a layout container; only its exported layers
  // become opaque leaves. The declaration's order is not a z-order override.
  const images: Array<IntentPlanRegion & { role: string; groupSelector?: string; sourceRegionId: string }> = [];
  for (const region of plan.regions) {
    if (region.export === false) continue;
    if (region.mode === "single-image") images.push({ ...region, role: "single-image", sourceRegionId: region.id });
    if (region.mode === "layers") {
      if (!region.selector?.trim()) issues.push(`Composite ${region.id} requires a container selector`);
      const layers = (region.layers ?? []).filter((layer) => layer.export !== false);
      if (layers.length < 2) issues.push(`Composite ${region.id} requires at least two exported layers`);
      layers.forEach((layer, index) => images.push({
        ...region, ...layer, id: `${region.id}-layer-${index + 1}`,
        nodeId: layer.nodeId, selector: undefined,
        sourceRegionId: region.id, groupSelector: region.selector,
      }));
    }
  }
  const imagesById = new Map<string, typeof images[number]>();
  const selectors = new Set<string>();
  for (const region of images) {
    if (!region.nodeId) issues.push(`Image ${region.id} requires a nodeId before code generation`);
    else if (imagesById.has(region.nodeId)) issues.push(`Duplicate image nodeId: ${region.nodeId}`);
    else imagesById.set(region.nodeId, region);
    if (region.role === "single-image") {
      if (!region.selector?.trim()) issues.push(`Image ${region.id} requires a selector before code generation`);
      else if (selectors.has(region.selector)) issues.push(`Duplicate image selector: ${region.selector}`);
      else selectors.add(region.selector);
    }
  }

  const envelope = Array.isArray(input) ? input : object(input, "Pixso input");
  const roots = Array.isArray(envelope) ? envelope : Array.isArray(envelope.nodes) ? envelope.nodes : [envelope];
  if (roots.length !== 1) throw new Error("Provide exactly one target frame tree; do not merge unrelated node results");
  const foundImages = new Set<string>();
  const imageHierarchy = new Map<string, NodeHierarchy>();
  const seen = new Set<string>();
  const visit = (raw: unknown, ancestors: string[] = [], siblingIndex = 0): GenerationNode => {
    const node = object(raw, "Pixso node");
    if (typeof node.guid !== "string" || !node.guid) throw new Error("Each Pixso node requires a string guid");
    const id = node.guid;
    if (seen.has(id)) throw new Error(`Duplicate node in frame tree: ${id}`);
    seen.add(id);
    const hierarchy: NodeHierarchy = {
      parentNodeId: ancestors.at(-1) ?? null,
      ancestorNodeIds: ancestors,
      sourceSiblingIndex: siblingIndex,
    };
    const image = imagesById.get(id);
    if (image) {
      foundImages.add(id);
      imageHierarchy.set(id, hierarchy);
      // Crucially, return BEFORE accessing childNode, text, type or appearance.
      // A GROUP/FRAME is still one image when the user says so.
      return {
        nodeId: id, name: image.name, representation: "single-image",
        hierarchy,
        properties: select(node, BOUNDARY_FIELDS), regionId: image.id,
        selector: image.selector,
      };
    }
    if (node.childNode !== undefined && !Array.isArray(node.childNode)) {
      throw new Error(`childNode must be an array at ${id}; adapt the response envelope without inventing hierarchy`);
    }
    return {
      nodeId: id,
      ...(typeof node.name === "string" ? { name: node.name } : {}),
      ...(typeof node.type === "string" ? { type: node.type } : {}),
      representation: "layout", properties: select(node, DESIGN_FIELDS),
      hierarchy,
      children: ((node.childNode ?? []) as unknown[]).map((child, index) => visit(child, [...ancestors, id], index)),
    };
  };
  const tree = visit(roots[0]);
  if (tree.nodeId !== plan.source.nodeId) issues.push(`Frame mismatch: expected ${plan.source.nodeId}, got ${tree.nodeId}`);
  for (const id of imagesById.keys()) {
    if (!foundImages.has(id)) issues.push(`Image node ${id} not found outside opaque boundaries; resolve scope or shallow layout data first`);
  }
  const blockedCodeNodeIds: string[] = [];
  const hasImage = new Map<string, boolean>();
  const mark = (node: GenerationNode): boolean => {
    const children = (node.children ?? []).map(mark);
    const contains = node.representation === "single-image" || children.some(Boolean);
    hasImage.set(node.nodeId, contains);
    if (contains) blockedCodeNodeIds.push(node.nodeId);
    return contains;
  };
  mark(tree);
  const codeNodeIds: string[] = [];
  const collect = (node: GenerationNode) => {
    if (!hasImage.get(node.nodeId)) codeNodeIds.push(node.nodeId);
    else if (node.representation !== "single-image") (node.children ?? []).forEach(collect);
  };
  if (!issues.length) collect(tree);
  return {
    schemaVersion: 1, kind: "visual-qa-generation-context",
    status: issues.length ? "needs-review" : "ready",
    sourceNodeId: plan.source.nodeId,
    images: images.map((region) => ({
      regionId: region.id, nodeId: region.nodeId, selector: region.selector,
      sourceRegionId: region.sourceRegionId, role: region.role,
      ...(region.groupSelector ? { groupSelector: region.groupSelector } : {}),
      representation: "single-image", pixsoAccess: "export-only",
      ...(region.nodeId && imageHierarchy.has(region.nodeId) ? { hierarchy: imageHierarchy.get(region.nodeId) } : {}),
    })),
    codeGeneration: {
      // Allowlist, never a claim that the CLI can intercept external MCP calls.
      allowedNodeIds: codeNodeIds, blockedNodeIds: blockedCodeNodeIds,
      unknownNodePolicy: "deny", opaqueDescendantPolicy: "deny",
    },
    hierarchyPolicy: {
      treeIsLayoutAuthority: true,
      siblingOrder: "source-childNode-order",
      imagesArrayRole: "asset-index-not-layout",
    },
    tree, issues,
  };
}

export async function writeGenerationContext(plan: IntentPlan, nodesPath: string, outputPath: string) {
  const context = createGenerationContext(plan, JSON.parse(await fs.readFile(nodesPath, "utf8")));
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(context, null, 2)}\n`);
  return {
    status: context.status, outputPath: path.resolve(outputPath),
    opaqueImages: context.images.length,
    allowedCodeNodeIds: context.codeGeneration.allowedNodeIds, issues: context.issues,
  };
}

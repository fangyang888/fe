import { createHash } from "node:crypto";
import { createGenerationContext, DESIGN_FIELDS } from "./generation-context.js";
import type { IntentPlan } from "./types.js";

type RawNode = Record<string, unknown> & { guid: string; childNode?: RawNode[] };
export interface DesignReadState {
  kind: "visual-qa-design-read-state";
  schemaVersion: 1;
  identity: string;
  tree: RawNode;
  queriedNodeIds: string[];
}

/** Produces transport-independent batches. The caller executes its available Pixso MCP. */
export function planDesignBatch(plan: IntentPlan, revision: string, state?: DesignReadState, responses: RawNode[] = [], batchSize = 16) {
  if (plan.kind !== "visual-qa-intent-plan" || plan.status !== "ready" || !plan.source.nodeId || !revision.trim()) throw new Error("A ready intent plan and explicit design revision are required");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 64) throw new Error("batchSize must be 1–64");
  const opaque = new Set<string>();
  for (const region of plan.regions) {
    if (region.export === false) continue;
    const entries = region.mode === "layers" ? (region.layers ?? []).filter((layer) => layer.export !== false) : [region];
    for (const entry of entries) {
      if (!entry.nodeId) throw new Error("Bind every image node before batching");
      opaque.add(entry.nodeId);
    }
  }
  if (opaque.has(plan.source.nodeId)) throw new Error("The whole frame is an image: export it without querying its internals");
  const identity = createHash("sha256").update(JSON.stringify({ revision, source: plan.source, regions: plan.regions })).digest("hex");
  if (state && (state.kind !== "visual-qa-design-read-state" || state.schemaVersion !== 1 || state.identity !== identity)) throw new Error("Design revision or image intent changed; use a new state file");
  const known = new Map<string, RawNode>();
  const index = (node: RawNode) => {
    if (!node || typeof node.guid !== "string" || !node.guid || known.has(node.guid)) throw new Error("Malformed or duplicate node hierarchy");
    known.set(node.guid, node);
    if (!opaque.has(node.guid)) {
      if (node.childNode !== undefined && !Array.isArray(node.childNode)) throw new Error("childNode must be an array");
      node.childNode?.forEach(index);
    }
  };
  const root = state?.tree ?? { guid: plan.source.nodeId };
  if (root.guid !== plan.source.nodeId) throw new Error("Wrong frame in state");
  index(root);
  const queried = new Set(state?.queriedNodeIds ?? []);
  for (const id of queried) if (!known.has(id) || opaque.has(id)) throw new Error("Invalid queried node in state");
  const updates = new Map<string, RawNode>();
  for (const node of responses) {
    if (!node || !known.has(node.guid) || opaque.has(node.guid) || queried.has(node.guid) || updates.has(node.guid)) throw new Error(`Unexpected, duplicate, already-read or opaque response: ${node?.guid}`);
    if (!Array.isArray(node.childNode)) throw new Error(`Response ${node.guid} must contain immediate childNode (use [] only for a confirmed leaf)`);
    updates.set(node.guid, node);
    queried.add(node.guid);
  }
  const boundaryFields = ["x", "y", "width", "height", "size", "transform", "absoluteBoundingBox", "constraints", "layoutPositioning", "zIndex", "isMask", "blendMode", "visible"];
  const prune = (node: RawNode, immediateOnly = false): RawNode => {
    const update = updates.get(node.guid);
    // Retain outer bounds returned with the parent when a later shallow read
    // only supplies this node's own text/layout and immediate children.
    const raw = update ? { ...node, ...update } : node;
    if (!raw || typeof raw.guid !== "string" || !raw.guid) throw new Error("Each child requires a guid");
    const isImage = opaque.has(raw.guid);
    const fields = isImage ? boundaryFields : ["name", "type", ...DESIGN_FIELDS];
    const out: RawNode = { guid: raw.guid, ...Object.fromEntries(fields.filter((field) => raw[field] !== undefined).map((field) => [field, raw[field]])) };
    // Never read image descendants. Unrequested grandchildren are also discarded.
    if (!isImage && !immediateOnly && raw.childNode !== undefined) {
      if (!Array.isArray(raw.childNode)) throw new Error("childNode must be an array");
      out.childNode = raw.childNode.map((child) => prune(child, updates.has(raw.guid)));
    }
    return out;
  };
  const tree = prune(root);
  known.clear();
  index(tree);
  const pending = [...known.keys()].filter((id) => !opaque.has(id) && !queried.has(id));
  const batches = [];
  for (let index = 0; index < pending.length; index += batchSize) batches.push({
    nodeIds: pending.slice(index, index + batchSize), readDepth: 1,
    fields: ["guid", "name", "type", ...DESIGN_FIELDS, "childNode"],
  });
  const context = pending.length ? undefined : createGenerationContext(plan, tree);
  return { status: pending.length ? "read-next-batch" : context!.status,
    state: { kind: "visual-qa-design-read-state" as const, schemaVersion: 1 as const, identity, tree, queriedNodeIds: [...queried] },
    batches, context, issues: context?.issues ?? [],
    stats: { queried: queried.size, pending: pending.length, batches: batches.length, opaqueImages: opaque.size } };
}

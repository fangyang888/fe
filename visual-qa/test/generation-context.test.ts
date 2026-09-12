import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createGenerationContext, writeGenerationContext } from "../src/generation-context.js";
import type { IntentPlan } from "../src/types.js";

function plan(): IntentPlan {
  return {
    schemaVersion: 1, kind: "visual-qa-intent-plan", name: "image-first",
    generatedAt: "2026-09-11T00:00:00Z", status: "ready",
    source: { provider: "pixso", nodeId: "138:97029" }, ambiguities: [],
    regions: [{
      id: "hero", order: 1, name: "Hero", mode: "single-image",
      nodeId: "138:42098", selector: "#hero", borderWidth: 0, confidence: 1,
    }],
  };
}
function tree() {
  return {
    guid: "138:97029", type: "FRAME", jsx: "unsafe ancestor code",
    childNode: [
      { guid: "layout", type: "GROUP", childNode: [
        { guid: "138:42098", type: "GROUP", width: 375, height: 366,
          nodeText: "do not recreate", fillPaints: ["red"],
          childNode: [{ guid: "fragment", type: "PATH", jsx: "fragment code" }] },
        { guid: "caption", type: "TEXT", nodeText: "Keep this caption" },
      ] },
      { guid: "footer", type: "GROUP", childNode: [{ guid: "footer-text", type: "TEXT" }] },
    ],
  };
}

test("user image ID overrides GROUP type and prunes internal text, paint, code and children", () => {
  const result = createGenerationContext(plan(), tree());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.tree.children?.[0].children?.[0], {
    nodeId: "138:42098", name: "Hero", representation: "single-image",
    hierarchy: { parentNodeId: "layout", ancestorNodeIds: ["138:97029", "layout"], sourceSiblingIndex: 0 },
    properties: { width: 375, height: 366 }, regionId: "hero", selector: "#hero",
  });
  assert.equal(JSON.stringify(result).includes("fragment"), false);
  assert.equal(JSON.stringify(result).includes("unsafe ancestor code"), false);
  assert.equal(result.tree.children?.[0].children?.[1].properties.nodeText, "Keep this caption");
});

test("does not even access an opaque node's children", () => {
  const input = tree();
  Object.defineProperty(input.childNode[0].childNode[0], "childNode", {
    get() { throw new Error("Descendant inspected"); },
  });
  assert.equal(createGenerationContext(plan(), input).status, "ready");
});

test("allows only maximal non-image subtrees, never the image or its ancestors", () => {
  const result = createGenerationContext(plan(), { nodes: [tree()] });
  assert.deepEqual(result.codeGeneration.allowedNodeIds, ["caption", "footer"]);
  assert.deepEqual(result.codeGeneration.blockedNodeIds, ["138:42098", "layout", "138:97029"]);
  assert.equal(result.codeGeneration.unknownNodePolicy, "deny");
});

test("overlapping image siblings preserve source order, not intent item order", () => {
  const intent = plan();
  intent.regions.unshift({ ...intent.regions[0], id: "pointer", nodeId: "pointer", selector: "#pointer" });
  const result = createGenerationContext(intent, {
    guid: intent.source.nodeId, childNode: [{ guid: "button-wrap", clipsContent: false, childNode: [
      { guid: "138:42098", type: "GROUP", x: 0, y: 0, zIndex: 3 },
      { guid: "pointer", type: "GROUP", x: 0, y: 0, zIndex: 4 },
    ] }],
  });
  assert.equal(result.status, "ready");
  const siblings = result.tree.children![0].children!;
  assert.deepEqual(siblings.map((node) => node.nodeId), ["138:42098", "pointer"]);
  assert.deepEqual(siblings.map((node) => node.hierarchy.sourceSiblingIndex), [0, 1]);
  assert.deepEqual(siblings.map((node) => node.properties.zIndex), [3, 4]);
  assert.equal(result.tree.children![0].properties.clipsContent, false);
  assert.equal(result.images[0].hierarchy?.parentNodeId, "button-wrap");
  assert.equal(result.images[0].hierarchy?.sourceSiblingIndex, 1);
});

test("nested positioning and clipping containers survive image pruning", () => {
  const result = createGenerationContext(plan(), {
    guid: plan().source.nodeId, childNode: [{ guid: "card", clipsContent: true,
      opacity: 0.8, childNode: [{ guid: "overlay", transform: { tx: 20, ty: 30 },
        childNode: [{ guid: "138:42098", type: "FRAME", x: 5, y: 6, childNode: [{ guid: "internal" }] }],
      }],
    }],
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.images[0].hierarchy?.ancestorNodeIds, [plan().source.nodeId, "card", "overlay"]);
  const card = result.tree.children![0];
  assert.equal(card.properties.clipsContent, true);
  assert.equal(card.properties.opacity, 0.8);
  assert.deepEqual(card.children![0].properties.transform, { tx: 20, ty: 30 });
  assert.equal(card.children![0].children![0].properties.x, 5);
  assert.equal(card.children![0].children![0].children, undefined);
});

test("missing image or wrong frame blocks generation instead of guessing scope", () => {
  const input = tree();
  input.guid = "other-page";
  input.childNode = [];
  const result = createGenerationContext(plan(), input);
  assert.equal(result.status, "needs-review");
  assert.equal(result.issues.length, 2);
  assert.deepEqual(result.codeGeneration.allowedNodeIds, []);
});

test("missing selector fails before a page or screenshot exists", () => {
  const intent = plan();
  delete intent.regions[0].selector;
  const result = createGenerationContext(intent, tree());
  assert.equal(result.status, "needs-review");
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.codeGeneration.allowedNodeIds, []);
});

test("explicit composite layers remain separate opaque assets inside their real container", () => {
  const intent = plan();
  intent.regions = [{ ...intent.regions[0], id: "button", mode: "layers", nodeId: "button-wrap",
    selector: "#button-wrap", layers: [
      { name: "finger", nodeId: "finger", role: "overlay-image" },
      { name: "base", nodeId: "base", role: "base-image" },
    ],
  }];
  const result = createGenerationContext(intent, { guid: intent.source.nodeId, childNode: [
    { guid: "button-wrap", childNode: [
      { guid: "base", type: "GROUP", childNode: [{ guid: "base-text", nodeText: "baked in" }] },
      { guid: "finger", type: "GROUP", childNode: [{ guid: "finger-path" }] },
    ] },
  ] });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.tree.children![0].children!.map((node) => node.nodeId), ["base", "finger"]);
  assert.deepEqual(result.images.map((image) => image.role), ["overlay-image", "base-image"]);
  assert.equal(result.images[0].groupSelector, "#button-wrap");
  assert.deepEqual(result.codeGeneration.allowedNodeIds, []);
  assert.equal(JSON.stringify(result).includes("baked in"), false);
});

test("unused export declarations do not block generation", () => {
  const intent = plan();
  intent.regions.push({ ...intent.regions[0], id: "unused", export: false, nodeId: undefined, selector: undefined });
  assert.equal(createGenerationContext(intent, tree()).status, "ready");
});

test("unmapped red frame requires node binding before code generation", () => {
  const intent = plan();
  delete intent.regions[0].nodeId;
  assert.equal(createGenerationContext(intent, tree()).status, "needs-review");
});

test("nested image declarations do not cause traversal into the parent image", () => {
  const intent = plan();
  intent.regions.push({ ...intent.regions[0], id: "inner", nodeId: "fragment", selector: "#inner" });
  const result = createGenerationContext(intent, tree());
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.codeGeneration.allowedNodeIds, []);
});

test("rejects malformed trees, duplicate visible IDs and multiple roots", () => {
  assert.throws(() => createGenerationContext(plan(), [{ guid: "a" }, { guid: "b" }]), /exactly one/);
  assert.throws(() => createGenerationContext(plan(), { guid: "a", childNode: "truncated" }), /array/);
  assert.throws(() => createGenerationContext(plan(), { guid: "a", childNode: [{ guid: "a" }] }), /Duplicate/);
  assert.throws(() => createGenerationContext(plan(), { content: "serialized JSX" }), /guid/);
});

test("unambiguous designs without images retain whole-frame code generation", () => {
  const intent = plan();
  intent.regions = [];
  assert.deepEqual(createGenerationContext(intent, [tree()]).codeGeneration.allowedNodeIds, [intent.source.nodeId]);
});

test("duplicate image declarations and unresolved plans fail closed", () => {
  const intent = plan();
  intent.regions.push({ ...intent.regions[0], id: "duplicate" });
  intent.status = "needs-review";
  const result = createGenerationContext(intent, tree());
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.codeGeneration.allowedNodeIds, []);
});

test("CLI writes sanitized output and returns nonzero for unresolved images without a browser", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "generation-context-test-"));
  try {
    const nodesPath = path.join(dir, "nodes.json");
    const planPath = path.join(dir, "plan.json");
    const output = path.join(dir, "generation.json");
    await fs.writeFile(nodesPath, JSON.stringify(tree()));
    await fs.writeFile(planPath, JSON.stringify(plan()));
    const result = await writeGenerationContext(plan(), nodesPath, output);
    assert.equal(result.status, "ready");
    assert.equal((await fs.readFile(output, "utf8")).includes("fragment code"), false);
    const run = () => spawnSync(process.execPath, [
      new URL("../src/cli.js", import.meta.url).pathname, "generation-context",
      "--plan", planPath, "--nodes", nodesPath, "--output", output,
    ], { encoding: "utf8" });
    assert.equal(run().status, 0);
    await fs.writeFile(nodesPath, JSON.stringify({ guid: plan().source.nodeId }));
    const failure = run();
    assert.equal(failure.status, 1, failure.stderr);
    assert.deepEqual(JSON.parse(failure.stdout).allowedCodeNodeIds, []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

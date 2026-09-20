import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { planDesignBatch } from "../src/design-batch.js";
import { generateScaffold, writeScaffold } from "../src/generate-scaffold.js";
import { generationTiming, summarizeGeneration } from "../src/generation-timing.js";
import type { IntentPlan } from "../src/types.js";

const intent: IntentPlan = {
  kind: "visual-qa-intent-plan", schemaVersion: 1, name: "pipeline", status: "ready", generatedAt: "", ambiguities: [],
  source: { provider: "pixso", nodeId: "frame" },
  regions: [{ id: "hero", order: 0, name: "Hero", mode: "single-image", nodeId: "image", selector: "#hero", borderWidth: 0, confidence: 1 }],
};
const initial = () => planDesignBatch(intent, "v1");
const frame = () => ({ guid: "frame", layoutMode: "VERTICAL", width: 375, childNode: [
  { guid: "card", type: "FRAME", childNode: [{ guid: "unexpected-deep" }] }, { guid: "label", type: "TEXT" },
] });
const card = () => ({ guid: "card", layoutMode: "VERTICAL", width: 300, height: 200, itemSpacing: 10, childNode: [
  { guid: "image", width: 300, height: 120, nodeText: "baked text", childNode: [{ guid: "secret" }] },
] });
const label = () => ({ guid: "label", nodeText: '<script>alert("x")</script> & text', fontSize: 16, childNode: [] });
function complete() {
  const second = planDesignBatch(intent, "v1", initial().state, [frame()]);
  return planDesignBatch(intent, "v1", second.state, [card(), label()]);
}

test("shallow batches combine siblings, reuse reads and retain hierarchy without opaque content", () => {
  assert.deepEqual(initial().batches.map((batch) => batch.nodeIds), [["frame"]]);
  const second = planDesignBatch(intent, "v1", initial().state, [frame()]);
  assert.deepEqual(second.batches.map((batch) => batch.nodeIds), [["card", "label"]]);
  assert.equal(JSON.stringify(second).includes("unexpected-deep"), false);
  const result = complete();
  assert.equal(result.status, "ready");
  assert.equal(result.context!.tree.children![0].children![0].hierarchy.parentNodeId, "card");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("baked text"), false);
  assert.deepEqual(planDesignBatch(intent, "v1", result.state).batches, []);
});

test("batch size, partial responses, revisions and malformed results are enforced", () => {
  const state = planDesignBatch(intent, "v1", initial().state, [frame()], 1).state;
  assert.equal(planDesignBatch(intent, "v1", state, [], 1).batches.length, 2);
  assert.deepEqual(planDesignBatch(intent, "v1", state, [card()]).batches[0].nodeIds, ["label"]);
  assert.throws(() => planDesignBatch(intent, "v2", state), /revision/);
  assert.throws(() => planDesignBatch(intent, "v1", state, [{ guid: "image", childNode: [] }]), /opaque/);
  assert.throws(() => planDesignBatch(intent, "v1", state, [card(), card()]), /duplicate/);
  assert.throws(() => planDesignBatch(intent, "v1", state, [{ guid: "card" }]), /immediate childNode/);
  assert.throws(() => planDesignBatch(intent, "v1", state, [], 0), /batchSize/);
  assert.throws(() => planDesignBatch(intent, "v1", initial().state, [{ guid: "frame", childNode: [{ guid: "same" }, { guid: "same" }] }]), /duplicate/);
  assert.equal(planDesignBatch(intent, "v1", initial().state, [{ guid: "frame", childNode: [] }]).status, "needs-review");
});

test("sanitizer never reads image children, including tool responses", () => {
  const response = card();
  Object.defineProperty(response.childNode[0], "childNode", { get() { throw new Error("opaque child accessed"); } });
  const state = planDesignBatch(intent, "v1", initial().state, [frame()]).state;
  assert.equal(planDesignBatch(intent, "v1", state, [response, label()]).status, "ready");
});

test("later shallow text reads retain bounds discovered from their real parent", () => {
  const plan = { ...intent, regions: [] };
  const first = planDesignBatch(plan, "v1");
  const second = planDesignBatch(plan, "v1", first.state, [{ guid: "frame", childNode: [{ guid: "text", width: 180, height: 24 }] }]);
  const last = planDesignBatch(plan, "v1", second.state, [{ guid: "text", nodeText: "hello", childNode: [] }]);
  assert.equal(last.context!.tree.children![0].properties.width, 180);
  assert.equal(last.context!.tree.children![0].properties.nodeText, "hello");
});

test("32 sibling nodes require two batches after the root, not 32 sequential reads", () => {
  const plan = { ...intent, regions: [] };
  const root = planDesignBatch(plan, "v1");
  const children = Array.from({ length: 32 }, (_, i) => ({ guid: `text-${i}`, nodeText: `Text ${i}`, childNode: [] }));
  const next = planDesignBatch(plan, "v1", root.state, [{ guid: "frame", childNode: children }]);
  assert.equal(root.batches.length + next.batches.length, 3);
  assert.equal(planDesignBatch(plan, "v1", next.state, children).status, "ready");
});

test("scaffold emits escaped nested HTML, image selectors and deterministic rem without root changes", () => {
  const context = complete().context!;
  const config = { unit: "rem" as const, rootFontSize: 10, assets: { image: { src: "./assets/hero.png", alt: "" } } };
  const result = generateScaffold(context, config);
  assert.deepEqual(generateScaffold(context, config), result);
  assert.equal((result.html.match(/<img /g) ?? []).length, 1);
  assert.match(result.html, /id="hero"/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.equal(result.html.includes("<script>"), false);
  assert.match(result.css, /width: 30rem/);
  assert.match(result.css, /font-size: 1.6rem/);
  assert.match(result.css, /margin-top: 1rem/);
  assert.equal(result.css.includes("gap:"), false);
  assert.equal(result.css.includes("html {"), false);
  assert.equal(result.manifest.status, "draft");
  assert.throws(() => generateScaffold(context, { ...config, rootFontSize: undefined }), /rootFontSize/);
  assert.throws(() => generateScaffold(context, { ...config, assets: { image: { src: "https://example.com/image", alt: "" } } }), /local asset/);
  assert.throws(() => generateScaffold(context, { ...config, layout: { unknown: { mode: "row" } } }), /Unknown configuration/);
  assert.throws(() => generateScaffold(context, { ...config, layout: { card: { mode: "absolute" } } }), /local left/);
});

test("unsupported properties and missing assets remain draft issues; opaque children fail closed", () => {
  const context = complete().context!;
  context.tree.children![0].properties.fillPaints = [{ unknown: true }];
  const result = generateScaffold(context, { unit: "px", assets: {} });
  assert.equal(result.html.includes("<img"), false);
  assert.ok(result.manifest.issues.some((issue) => issue.message.includes("Missing local image")));
  assert.ok(result.manifest.issues.some((issue) => issue.message.includes("fillPaints")));
  const invalid = structuredClone(context);
  invalid.tree.children![0].children![0].children = [context.tree.children![1]];
  assert.throws(() => generateScaffold(invalid, { unit: "px", assets: {} }), /Opaque/);
});

test("timing separates wall time, overlap coverage, failures and open spans", () => {
  const result = summarizeGeneration([
    { kind: "mark", id: "run-start", at: 0 },
    { kind: "start", id: "a", stage: "assets", at: 10 },
    { kind: "start", id: "b", stage: "assets", at: 20 },
    { kind: "end", id: "a", at: 60, status: "ok" },
    { kind: "end", id: "b", at: 100, status: "failed" },
    { kind: "mark", id: "first-preview", at: 120 },
    { kind: "start", id: "fix-1", stage: "repair", at: 140 },
  ]);
  assert.equal(result.elapsedMs, 140);
  assert.equal(result.stages[0].sumMs, 130);
  assert.equal(result.stages[0].coveredMs, 90);
  assert.equal(result.stages[0].failed, 1);
  assert.equal(result.milestones["first-preview"], 120);
  assert.equal(result.openSpans[0].id, "fix-1");
  assert.throws(() => summarizeGeneration([{ kind: "end", id: "no-start", at: 1, status: "ok" }]), /Invalid end/);
  assert.throws(() => summarizeGeneration([{ kind: "mark", id: "x", at: 2 }, { kind: "mark", id: "y", at: 1 }]), /non-monotonic/);
});

test("CLI persists batches, scaffold and failure timings without overwriting hand edits", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vqa-pipeline-"));
  try {
    const cli = new URL("../src/cli.js", import.meta.url).pathname;
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });
    await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(intent));
    const batch = (...args: string[]) => run("design-batch", "--plan", "plan.json", "--revision", "v1", "--state", "state.json", "--output", "batch.json", ...args);
    assert.equal(batch().status, 0);
    await fs.writeFile(path.join(dir, "responses.json"), JSON.stringify([frame()]));
    assert.equal(batch("--responses", "responses.json").status, 0);
    await fs.writeFile(path.join(dir, "responses.json"), JSON.stringify([card(), label()]));
    const last = batch("--responses", "responses.json");
    assert.equal(last.status, 0, last.stderr);
    assert.equal(last.stdout.includes("nodeText"), false);
    const context = JSON.parse(await fs.readFile(path.join(dir, "batch.json"), "utf8")).context;
    await fs.writeFile(path.join(dir, "context.json"), JSON.stringify(context));
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ unit: "rem", rootFontSize: 10, assets: { image: { src: "./hero.png", alt: "" } } }));
    const generated = run("generate-scaffold", "--context", "context.json", "--config", "config.json", "--output", "draft", "--trace-log", "timing.jsonl");
    assert.equal(generated.status, 0, generated.stderr);
    const output = path.join(dir, "draft", "fragment.html");
    await fs.writeFile(output, "hand edit");
    await assert.rejects(writeScaffold(context, { unit: "px", assets: {} }, path.join(dir, "draft")), /EEXIST/);
    assert.equal(await fs.readFile(output, "utf8"), "hand edit");
    assert.equal(run("unknown", "--trace-log", "timing.jsonl").status, 2);
    const summary = await generationTiming(path.join(dir, "timing.jsonl"));
    assert.equal(summary.spans.length, 2);
    assert.equal(summary.spans[1].status, "failed");
    assert.equal(summary.openSpans.length, 0);
    await Promise.all(Array.from({ length: 8 }, (_, i) => generationTiming(path.join(dir, "timing.jsonl"), { kind: "mark", id: `parallel-${i}` })));
    assert.equal(Object.keys((await generationTiming(path.join(dir, "timing.jsonl"))).milestones).length, 8);
    assert.equal(run("generation-timing", "--log", "timing.jsonl", "--action", "mark", "--id", "first-preview").status, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

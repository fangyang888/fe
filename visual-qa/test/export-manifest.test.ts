import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createExportManifest,
  writeExportManifest,
} from "../src/export-manifest.js";
import type { IntentPlan } from "../src/types.js";

function plan(regions: IntentPlan["regions"], ambiguities: string[] = []): IntentPlan {
  return {
    schemaVersion: 1,
    kind: "visual-qa-intent-plan",
    name: "family-card",
    generatedAt: "2026-09-03T00:00:00.000Z",
    status: ambiguities.length === 0 ? "ready" : "needs-review",
    source: {
      provider: "pixso",
      nodeId: "138:97029",
      annotatedImage: "/tmp/annotated.png",
      imageSize: { width: 375, height: 812 },
      viewport: { width: 375, height: 812 },
      frameBounds: { x: 0, y: 0, width: 375, height: 812 },
    },
    regions,
    ambiguities,
  };
}

test("creates crop and exact Pixso node export operations", () => {
  const manifest = createExportManifest({
    plan: plan([
      {
        id: "region-1",
        order: 1,
        name: "title",
        mode: "dom-text",
        annotationBounds: { x: 40, y: 90, width: 160, height: 60 },
        bounds: { x: 40, y: 90, width: 160, height: 60 },
        borderWidth: 3,
        confidence: 0.99,
      },
      {
        id: "region-2",
        order: 2,
        name: "member-card",
        mode: "single-image",
        annotationBounds: { x: 40, y: 150, width: 300, height: 164 },
        bounds: { x: 43, y: 153, width: 294, height: 158 },
        borderWidth: 3,
        confidence: 1,
      },
      {
        id: "region-3",
        order: 3,
        name: "claim-button",
        mode: "layers",
        annotationBounds: { x: 40, y: 320, width: 300, height: 76 },
        bounds: { x: 43, y: 323, width: 294, height: 70 },
        borderWidth: 3,
        confidence: 1,
        layers: [
          {
            name: "button-base",
            role: "base-image",
            nodeId: "138:97159",
            format: "svg",
          },
          {
            name: "finger",
            role: "overlay-image",
            nodeId: "138:97174",
            format: "svg",
          },
        ],
      },
    ]),
    assetsDir: "src/assets/images",
    scale: 2,
  });

  assert.equal(manifest.status, "ready");
  assert.equal(manifest.exports.length, 3);
  assert.equal(manifest.exports[0]?.operation.kind, "pixso-frame-export-crop");
  assert.deepEqual(manifest.exports[0]?.operation.crop, {
    x: 86,
    y: 306,
    width: 588,
    height: 316,
  });
  assert.equal(manifest.exports[1]?.operation.kind, "pixso-node-export");
  assert.deepEqual(manifest.exports[1]?.operation.args, {
    guid: "138:97159",
    exportSettings: {
      imageType: 3,
      constraint: { type: 1, value: 2 },
    },
  });
  assert.deepEqual(manifest.skipped, [
    { regionId: "region-1", name: "title", reason: "dom-text" },
  ]);
});

test("keeps unresolved layered regions in needs-review", () => {
  const manifest = createExportManifest({
    plan: plan([
      {
        id: "region-1",
        order: 1,
        name: "claim-button",
        mode: "layers",
        annotationBounds: { x: 0, y: 0, width: 100, height: 50 },
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        borderWidth: 2,
        confidence: 1,
      },
    ]),
  });

  assert.equal(manifest.status, "needs-review");
  assert.match(manifest.ambiguities[0] ?? "", /at least two/);
});

test("exports PNG assets at 3x by default", () => {
  const manifest = createExportManifest({
    plan: plan([
      {
        id: "region-1",
        order: 1,
        name: "member-card",
        mode: "single-image",
        nodeId: "138:97117",
        bounds: { x: 38, y: 172, width: 300, height: 163 },
        annotationBounds: { x: 40, y: 150, width: 300, height: 164 },
        borderWidth: 3,
        confidence: 1,
      },
    ]),
  });

  assert.equal(manifest.exports[0]?.format, "png");
  assert.equal(manifest.exports[0]?.file, "assets/images/member-card.png");
  assert.deepEqual(manifest.exports[0]?.operation.args, {
    guid: "138:97117",
    exportSettings: {
      imageType: 1,
      constraint: { type: 1, value: 3 },
    },
  });
  assert.deepEqual(manifest.exports[0]?.dimensionPolicy, {
    expectedPixelSize: { width: 900, height: 489 },
    onMismatch: "use-fallback",
    fallback: {
      kind: "pixso-frame-export-crop",
      tool: "get_export_image",
      args: {
        guid: "138:97029",
        exportSettings: {
          imageType: 1,
          constraint: { type: 1, value: 3 },
        },
      },
      crop: { x: 114, y: 516, width: 900, height: 489 },
    },
    retain: "final-only",
  });
});

test("trusts an explicit item id for direct export when design bounds are omitted", () => {
  const manifest = createExportManifest({
    plan: plan([
      {
        id: "item-1",
        order: 1,
        name: "item-138-97117",
        mode: "single-image",
        source: "item-id",
        nodeId: "138:97117",
        borderWidth: 0,
        confidence: 1,
      },
    ]),
  });

  assert.equal(manifest.status, "ready");
  assert.equal(manifest.exports.length, 1);
  assert.equal(manifest.exports[0]?.operation.kind, "pixso-node-export");
  assert.deepEqual(manifest.ambiguities, []);
});

test("skips image regions that are not used by the implementation", () => {
  const manifest = createExportManifest({
    plan: plan([
      {
        id: "region-1",
        order: 1,
        name: "decorative-fragment",
        mode: "single-image",
        export: false,
        nodeId: "138:99999",
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        annotationBounds: { x: 10, y: 10, width: 20, height: 20 },
        borderWidth: 2,
        confidence: 1,
      },
    ]),
  });

  assert.equal(manifest.exports.length, 0);
  assert.deepEqual(manifest.skipped, [
    { regionId: "region-1", name: "decorative-fragment", reason: "not-used" },
  ]);
});

test("reuses unchanged assets by cached file hash", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-assets-"));
  const assetsDirectory = path.join(directory, "assets");
  const outputPath = path.join(directory, "manifest.json");
  const cachePath = path.join(directory, "cache.json");
  await fs.mkdir(assetsDirectory);
  await fs.writeFile(path.join(assetsDirectory, "member-card.png"), "png-data");
  const input = {
    plan: plan([
      {
        id: "region-1",
        order: 1,
        name: "member-card",
        mode: "single-image" as const,
        nodeId: "138:97117",
        annotationBounds: { x: 40, y: 150, width: 300, height: 164 },
        borderWidth: 3,
        confidence: 1,
      },
    ]),
    assetsDir: "assets",
  };

  const first = await writeExportManifest(input, outputPath, {
    reuseAssets: true,
    cachePath,
    baseDirectory: directory,
  });
  const second = await writeExportManifest(input, outputPath, {
    reuseAssets: true,
    cachePath,
    baseDirectory: directory,
  });

  assert.equal(first.exports[0]?.reuse?.status, "export");
  assert.equal(second.exports[0]?.reuse?.status, "reuse");
  assert.deepEqual(second.reusedAssets, ["assets/member-card.png"]);
});

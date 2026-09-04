import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import {
  createIntentPlan,
  detectAnnotatedRectangles,
  inferDesignFrame,
} from "../src/intent-plan.js";

function fill(
  image: PNG,
  bounds: { x: number; y: number; width: number; height: number },
  color: [number, number, number],
): void {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
}

function stroke(
  image: PNG,
  bounds: { x: number; y: number; width: number; height: number },
  thickness = 2,
): void {
  const red: [number, number, number] = [255, 70, 70];
  fill(image, { ...bounds, height: thickness }, red);
  fill(
    image,
    { x: bounds.x, y: bounds.y + bounds.height - thickness, width: bounds.width, height: thickness },
    red,
  );
  fill(image, { ...bounds, width: thickness }, red);
  fill(
    image,
    { x: bounds.x + bounds.width - thickness, y: bounds.y, width: thickness, height: bounds.height },
    red,
  );
}

function fixtureImage(): PNG {
  const image = new PNG({ width: 240, height: 300 });
  fill(image, { x: 0, y: 0, width: 240, height: 300 }, [80, 80, 80]);
  fill(image, { x: 70, y: 40, width: 100, height: 200 }, [255, 245, 160]);
  stroke(image, { x: 80, y: 60, width: 60, height: 40 });
  stroke(image, { x: 80, y: 120, width: 80, height: 50 });
  return image;
}

test("detects red annotation rectangles and excludes their borders", () => {
  const rectangles = detectAnnotatedRectangles(fixtureImage());

  assert.equal(rectangles.length, 2);
  assert.deepEqual(rectangles[0]?.bounds, { x: 80, y: 60, width: 60, height: 40 });
  assert.deepEqual(rectangles[0]?.contentBounds, {
    x: 82,
    y: 62,
    width: 56,
    height: 36,
  });
  assert.equal(rectangles[0]?.borderWidth, 2);
});

test("separates annotation rectangles that touch at one horizontal edge", () => {
  const image = new PNG({ width: 160, height: 160 });
  fill(image, { x: 0, y: 0, width: 160, height: 160 }, [80, 80, 80]);
  fill(image, { x: 20, y: 10, width: 120, height: 140 }, [255, 245, 160]);
  stroke(image, { x: 50, y: 40, width: 50, height: 40 }, 3);
  stroke(image, { x: 30, y: 77, width: 90, height: 50 }, 3);

  const rectangles = detectAnnotatedRectangles(image);

  assert.equal(rectangles.length, 2);
  assert.deepEqual(rectangles.map((rectangle) => rectangle.bounds), [
    { x: 50, y: 40, width: 50, height: 40 },
    { x: 30, y: 77, width: 90, height: 50 },
  ]);
});

test("infers the design frame against a contrasting editor canvas", () => {
  assert.deepEqual(inferDesignFrame(fixtureImage(), { width: 100, height: 200 }), {
    x: 70,
    y: 40,
    width: 100,
    height: 200,
  });
});

test("creates a ready intent plan with mapped Pixso coordinates", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "intent-plan-"));
  const annotatedImage = path.join(directory, "annotated.png");
  await fs.writeFile(annotatedImage, PNG.sync.write(fixtureImage()));

  const plan = await createIntentPlan({
    name: "family-card",
    designUrl: "https://pixso.cn/app/design/example?item-id=138:97029",
    sourceNodeId: "138:97029",
    annotatedImage,
    viewport: { width: 100, height: 200 },
    hints: [
      { order: 1, name: "title", mode: "dom-text" },
      { order: 2, name: "member-card", mode: "single-image" },
    ],
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.regions[0]?.bounds, {
    x: 12,
    y: 22,
    width: 56,
    height: 36,
  });
  assert.deepEqual(plan.regions[1]?.bounds, {
    x: 12,
    y: 82,
    width: 76,
    height: 46,
  });
  assert.deepEqual(plan.ambiguities, []);
});

test("marks unclassified regions for review", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "intent-plan-"));
  const annotatedImage = path.join(directory, "annotated.png");
  await fs.writeFile(annotatedImage, PNG.sync.write(fixtureImage()));

  const plan = await createIntentPlan({
    name: "review",
    sourceNodeId: "138:97029",
    annotatedImage,
    viewport: { width: 100, height: 200 },
  });

  assert.equal(plan.status, "needs-review");
  assert.equal(plan.regions.every((region) => region.mode === "review"), true);
  assert.equal(plan.ambiguities.length, 2);
});

test("preserves explicit design bounds and unused export intent", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "intent-plan-"));
  const annotatedImage = path.join(directory, "annotated.png");
  await fs.writeFile(annotatedImage, PNG.sync.write(fixtureImage()));

  const plan = await createIntentPlan({
    name: "curated-assets",
    sourceNodeId: "138:97029",
    annotatedImage,
    viewport: { width: 100, height: 200 },
    hints: [
      { order: 1, name: "title", mode: "dom-text" },
      {
        order: 2,
        name: "unused-decoration",
        mode: "single-image",
        export: false,
        bounds: { x: 10, y: 20, width: 30, height: 40 },
      },
    ],
  });

  assert.deepEqual(plan.regions[1]?.bounds, {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  });
  assert.equal(plan.regions[1]?.export, false);
});

test("creates an image plan from exact Pixso item ids without a red-frame image", async () => {
  const plan = await createIntentPlan({
    name: "item-assets",
    sourceNodeId: "138:97029",
    items: [
      "138:97030",
      {
        itemId: "138:97117",
        name: "member-card",
        format: "png",
        bounds: { x: 38, y: 260, width: 300, height: 163 },
      },
    ],
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.source.annotatedImage, undefined);
  assert.deepEqual(
    plan.regions.map((region) => ({
      name: region.name,
      nodeId: region.nodeId,
      mode: region.mode,
      source: region.source,
    })),
    [
      {
        name: "item-138-97030",
        nodeId: "138:97030",
        mode: "single-image",
        source: "item-id",
      },
      {
        name: "member-card",
        nodeId: "138:97117",
        mode: "single-image",
        source: "item-id",
      },
    ],
  );
  assert.deepEqual(plan.ambiguities, []);
});

test("prefers exact item ids over duplicate red-frame hints", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "intent-plan-"));
  const annotatedImage = path.join(directory, "annotated.png");
  await fs.writeFile(annotatedImage, PNG.sync.write(fixtureImage()));

  const plan = await createIntentPlan({
    name: "mixed-intent",
    sourceNodeId: "138:97029",
    annotatedImage,
    viewport: { width: 100, height: 200 },
    items: ["138:97117"],
    hints: [
      {
        order: 1,
        name: "member-card-from-frame",
        mode: "single-image",
        nodeId: "138:97117",
      },
      { order: 2, name: "title", mode: "dom-text" },
    ],
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(
    plan.regions.map((region) => [region.id, region.name, region.source]),
    [
      ["item-1", "item-138-97117", "item-id"],
      ["region-2", "title", "red-frame"],
    ],
  );
});

test("rejects duplicate Pixso item ids", async () => {
  await assert.rejects(
    createIntentPlan({
      name: "duplicate-items",
      sourceNodeId: "138:97029",
      items: ["138:97117", "138:97117"],
    }),
    /Duplicate item id: 138:97117/,
  );
});

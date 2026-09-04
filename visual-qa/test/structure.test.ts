import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { inspectVisualStructure } from "../src/structure.js";

interface FakeElement {
  tagName: string;
  imageSource: string | null;
  visibleChildren: number;
  rect: { x: number; y: number; width: number; height: number };
}

function fakePage(
  elements: Record<string, FakeElement>,
  overlayAboveBase: boolean | null = true,
): Page {
  return {
    locator(selector: string) {
      const evidence = elements[selector];
      const locator = {
        count: async () => (evidence ? 1 : 0),
        first: () => locator,
        evaluate: async () => evidence,
      };
      return locator;
    },
    evaluate: async () => overlayAboveBase,
  } as unknown as Page;
}

const image = (
  x: number,
  y: number,
  width: number,
  height: number,
): FakeElement => ({
  tagName: "img",
  imageSource: "data:image/png;base64,fixture",
  visibleChildren: 0,
  rect: { x, y, width, height },
});

test("passes a single image and an overflowing overlay above its base", async () => {
  const page = fakePage({
    "#card": image(20, 20, 300, 160),
    "#claim": {
      tagName: "div",
      imageSource: null,
      visibleChildren: 2,
      rect: { x: 20, y: 200, width: 330, height: 80 },
    },
    "#claim-base": image(30, 210, 300, 50),
    "#finger": image(300, 235, 50, 50),
  });

  const result = await inspectVisualStructure(page, {
    regions: [
      { name: "card", type: "single-image", selector: "#card" },
      {
        name: "claim",
        type: "composite-image",
        selector: "#claim",
        base: { selector: "#claim-base" },
        overlays: [
          {
            name: "finger",
            selector: "#finger",
            mustOverflowBase: true,
          },
        ],
      },
    ],
  });

  assert.equal(result.passed, true);
  assert.equal(result.regions.length, 2);
  assert.equal(
    result.regions[1]?.checks.find(
      (check) => check.check === "overlay:finger:above-base",
    )?.passed,
    true,
  );
});

test("fails when an overlay is painted behind its base", async () => {
  const page = fakePage(
    {
      "#claim": {
        tagName: "div",
        imageSource: null,
        visibleChildren: 2,
        rect: { x: 20, y: 200, width: 330, height: 80 },
      },
      "#claim-base": image(30, 210, 300, 50),
      "#finger": image(290, 220, 30, 30),
    },
    false,
  );

  const result = await inspectVisualStructure(page, {
    regions: [
      {
        name: "claim",
        type: "composite-image",
        selector: "#claim",
        base: { selector: "#claim-base" },
        overlays: [{ name: "finger", selector: "#finger" }],
      },
    ],
  });

  assert.equal(result.passed, false);
  assert.match(
    result.regions[0]?.checks.find(
      (check) => check.check === "overlay:finger:above-base",
    )?.message ?? "",
    /behind/,
  );
});

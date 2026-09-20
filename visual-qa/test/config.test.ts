import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { normalizeVisualCase } from "../src/config.js";

test("normalizes paths and visual defaults", () => {
  const configPath = path.resolve("cases/example.json");
  const result = normalizeVisualCase(
    {
      name: "example",
      designImage: "./design.png",
      url: "http://127.0.0.1:3000/example",
      viewport: { width: 375, height: 812 },
    },
    configPath,
  );

  assert.equal(result.designImage, path.resolve("cases/design.png"));
  assert.equal(result.viewport.deviceScaleFactor, 1);
  assert.equal(result.thresholds?.maxMismatchPercent, 1.5);
  assert.equal(result.wait?.stableFrames, 3);
  assert.equal(result.browserChannel, "chrome");
  assert.equal(result.cssRules?.preferFlex, true);
  assert.equal(result.cssRules?.allowGap, false);
  assert.equal(result.cssRules?.preferRem, false);
  assert.equal(result.cssRules?.preferResponsivePage, true);
  assert.equal(result.cssRules?.rejectSuspiciousCss, true);
  assert.equal(result.cssRules?.failOnMismatch, true);
  assert.equal(result.cssRules?.failOnSeverity, "error");
  assert.equal(result.cssRules?.scopeSelector, "body");
  assert.equal(result.cssRules?.pageShellSelector, ":scope > :first-child");
  assert.equal(result.cssRules?.positionContextMaxDepth, 2);
});

test("normalizes CSS compatibility rule overrides", () => {
  const result = normalizeVisualCase(
    {
      name: "css-rules",
      designImage: "design.png",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
      cssRules: {
        preferFlex: false,
        allowGap: true,
        preferRem: true,
        preferResponsivePage: false,
        rejectSuspiciousCss: false,
        failOnMismatch: false,
        failOnSeverity: "warning",
        scopeSelector: "#app",
        pageShellSelector: ".page",
        positionContextMaxDepth: 3,
        ignoreSelectors: [".third-party"],
      },
    },
    "case.json",
  );

  assert.deepEqual(result.cssRules, {
    preferFlex: false,
    allowGap: true,
    preferRem: true,
    preferResponsivePage: false,
    rejectSuspiciousCss: false,
    failOnMismatch: false,
    failOnSeverity: "warning",
    scopeSelector: "#app",
    pageShellSelector: ".page",
    positionContextMaxDepth: 3,
    ignoreSelectors: [".third-party"],
  });
});

test("normalizes changed-only region mappings", () => {
  const configPath = path.resolve("cases/example.json");
  const result = normalizeVisualCase(
    {
      name: "changed-only",
      designImage: "design.png",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
      changeDetection: {
        projectRoot: "../app",
        baseRef: "HEAD",
        regions: [
          {
            name: "header",
            bounds: { x: 0, y: 0, width: 375, height: 120 },
            sourcePatterns: ["src/header/**"],
          },
        ],
      },
    },
    configPath,
  );

  assert.equal(
    result.changeDetection?.projectRoot,
    path.resolve("cases/../app"),
  );
  assert.deepEqual(result.changeDetection?.regions[0]?.sourcePatterns, [
    "src/header/**",
  ]);
});

test("rejects an invalid viewport", () => {
  assert.throws(
    () =>
      normalizeVisualCase(
        {
          name: "invalid",
          designImage: "design.png",
          url: "http://127.0.0.1:3000",
          viewport: { width: 0, height: 812 },
        },
        "case.json",
      ),
    /viewport.width must be a positive number/,
  );
});

test("rejects invalid CSS rule thresholds", () => {
  assert.throws(
    () =>
      normalizeVisualCase(
        {
          name: "invalid-css-rules",
          designImage: "design.png",
          url: "http://127.0.0.1:3000",
          viewport: { width: 375, height: 812 },
          cssRules: { positionContextMaxDepth: 0 },
        },
        "case.json",
      ),
    /positionContextMaxDepth must be a positive integer/,
  );
});

test("normalizes visual structure intent defaults", () => {
  const result = normalizeVisualCase(
    {
      name: "structure",
      designImage: "design.png",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
      structure: {
        regions: [
          {
            name: "member-card",
            type: "single-image",
            selector: "#member-card",
          },
          {
            name: "claim-button",
            type: "composite-image",
            selector: "#claim",
            base: { selector: "#claim-background" },
            overlays: [{ name: "finger", selector: "#finger" }],
          },
        ],
      },
    },
    "case.json",
  );

  assert.equal(result.structure?.failOnMismatch, true);
  const single = result.structure?.regions[0];
  assert.equal(single?.type, "single-image");
  if (single?.type === "single-image") {
    assert.equal(single.requireNoVisibleChildren, true);
  }
  const composite = result.structure?.regions[1];
  assert.equal(composite?.type, "composite-image");
  if (composite?.type === "composite-image") {
    assert.equal(composite.overlays[0]?.mustOverlap, true);
    assert.equal(composite.overlays[0]?.mustOverflowBase, false);
    assert.equal(composite.overlays[0]?.mustBeAboveBase, true);
  }
});

test("resolves an intent plan path relative to the case", () => {
  const result = normalizeVisualCase(
    {
      name: "intent-plan",
      designImage: "design.png",
      intentPlan: "./intent-plan.json",
      url: "http://127.0.0.1:3000",
      viewport: { width: 375, height: 812 },
    },
    "/tmp/visual-qa/case.json",
  );

  assert.equal(result.intentPlan, "/tmp/visual-qa/intent-plan.json");
});

test("rejects a composite image without overlays", () => {
  assert.throws(
    () =>
      normalizeVisualCase(
        {
          name: "invalid-structure",
          designImage: "design.png",
          url: "http://127.0.0.1:3000",
          viewport: { width: 375, height: 812 },
          structure: {
            regions: [
              {
                name: "claim-button",
                type: "composite-image",
                selector: "#claim",
                base: { selector: "#claim-background" },
                overlays: [],
              },
            ],
          },
        },
        "case.json",
      ),
    /overlays must contain at least one overlay/,
  );
});

test("critical regions reject ambiguous names, invalid bounds and thresholds", () => {
  const base = { name: "critical", url: "http://localhost:3000", designImage: "design.png", viewport: { width: 100, height: 100 } };
  const region = { name: "icon", bounds: { x: 0, y: 0, width: 10, height: 10 }, thresholds: { minSsim: 0.99 } };
  assert.equal(normalizeVisualCase({ ...base, criticalRegions: [region] }, "case.json").criticalRegions![0]!.name, "icon");
  assert.throws(() => normalizeVisualCase({ ...base, criticalRegions: [region, region] }, "case.json"), /Duplicate/);
  assert.throws(() => normalizeVisualCase({ ...base, criticalRegions: [{ ...region, bounds: { ...region.bounds, x: -1 } }] }, "case.json"), /bounds/);
  assert.throws(() => normalizeVisualCase({ ...base, criticalRegions: [{ ...region, thresholds: { minSsim: 2 } }] }, "case.json"), /minSsim/);
});

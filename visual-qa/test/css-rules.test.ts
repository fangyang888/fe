import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { inspectCssRules } from "../src/css-rules.js";
import type { CssRuleViolation } from "../src/types.js";

function fakePage(violations: CssRuleViolation[]): Page {
  return {
    evaluate: async () => violations,
  } as unknown as Page;
}

const rules = {
  preferFlex: true,
  allowGap: false,
  preferResponsivePage: true,
  rejectSuspiciousCss: true,
  failOnMismatch: true,
  failOnSeverity: "error" as const,
  scopeSelector: "#app",
  pageShellSelector: ".page",
  positionContextMaxDepth: 2,
  ignoreSelectors: [],
};

test("passes when the page has no incompatible layout declarations", async () => {
  const result = await inspectCssRules(fakePage([]), rules);

  assert.equal(result.passed, true);
  assert.deepEqual(result.violations, []);
});

test("reports grid and gap compatibility violations", async () => {
  const violations: CssRuleViolation[] = [
    {
      rule: "prefer-flex",
      severity: "error",
      selector: ".cards",
      display: "grid",
      rowGap: "12px",
      columnGap: "12px",
      message: ".cards uses grid",
    },
    {
      rule: "no-gap",
      severity: "error",
      selector: ".tabs",
      display: "flex",
      rowGap: "0px",
      columnGap: "8px",
      message: ".tabs uses gap",
    },
  ];
  const result = await inspectCssRules(fakePage(violations), rules);

  assert.equal(result.passed, false);
  assert.equal(result.violations.length, 2);
  assert.equal(result.violations[0]?.rule, "prefer-flex");
  assert.equal(result.violations[1]?.rule, "no-gap");
});

test("reports warnings without failing the default error threshold", async () => {
  const violations: CssRuleViolation[] = [
    {
      rule: "absolute-position-context",
      severity: "warning",
      selector: ".badge",
      display: "block",
      rowGap: "normal",
      columnGap: "normal",
      property: "position",
      value: "absolute",
      message: ".badge uses a distant positioning context",
    },
  ];

  const result = await inspectCssRules(fakePage(violations), rules);

  assert.equal(result.passed, true);
  assert.deepEqual(result.counts, { error: 0, warning: 1, info: 0 });
});

test("can fail verification on warnings", async () => {
  const violations: CssRuleViolation[] = [
    {
      rule: "suspicious-css",
      severity: "warning",
      selector: ".card",
      display: "block",
      rowGap: "normal",
      columnGap: "normal",
      property: "width",
      value: "100.123px",
      message: ".card uses over-precise pixels",
    },
  ];

  const result = await inspectCssRules(fakePage(violations), {
    ...rules,
    failOnSeverity: "warning",
  });

  assert.equal(result.passed, false);
  assert.equal(result.counts.warning, 1);
});

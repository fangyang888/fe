import { promises as fs } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { hashValue } from "./cache.js";
import type { DesignContract, MeasurementIssue, MeasurementResult } from "./types.js";

export function normalizeContract(input: DesignContract): DesignContract {
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const tolerance = (value: unknown) => finite(value) && (value as number) >= 0;
  if (!input || !Array.isArray(input.elements) || !input.elements.length) {
    throw new Error("contract.elements must not be empty");
  }
  if (input.tolerance !== undefined && !tolerance(input.tolerance)) throw new Error("Invalid contract tolerance");
  const names = new Set<string>();
  for (const element of input.elements) {
    if (!element.name?.trim() || !element.selector?.trim() || names.has(element.name)) throw new Error("Contract requires unique names and non-empty selectors");
    names.add(element.name);
    for (const [key, value] of Object.entries(element.bounds ?? {})) {
      if (!["x", "y", "width", "height"].includes(key) || !finite(value) || (["width", "height"].includes(key) && value < 0)) throw new Error(`Invalid bounds for ${element.name}`);
    }
    for (const [property, value] of Object.entries(element.styles ?? {})) {
      if (!/^[a-z][a-z-]*$/.test(property) || !(finite(value) || (typeof value === "string" && value.trim()))) throw new Error(`Invalid style for ${element.name}: ${property}`);
    }
  }
  for (const element of input.elements) {
    const seen = new Set<string>();
    for (const relation of element.relations ?? []) {
      const key = `${relation.metric}:${relation.target}`;
      if (!names.has(relation.target) || seen.has(key) || !["gapY", "gapX", "alignLeft", "alignTop", "centerX"].includes(relation.metric) || !finite(relation.expected) || (relation.tolerance !== undefined && !tolerance(relation.tolerance))) throw new Error(`Invalid relation for ${element.name}`);
      seen.add(key);
    }
  }
  return { ...input, tolerance: input.tolerance ?? 1, failOnMismatch: input.failOnMismatch ?? true };
}

export async function inspectMeasurements(page: Page, input: DesignContract): Promise<MeasurementResult> {
  const contract = normalizeContract(input);
  // One browser round trip, only explicitly requested elements and style fields.
  const measurements = await page.evaluate((elements) => elements.map((spec) => {
    const matches = document.querySelectorAll(spec.selector);
    const element = matches[0];
    if (matches.length !== 1 || !element) return { name: spec.name, count: matches.length, visible: false, styles: {} };
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return {
      name: spec.name, count: 1,
      visible: rect.width > 0 && rect.height > 0 && css.visibility !== "hidden" && css.visibility !== "collapse" && css.display !== "none",
      bounds: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
      styles: Object.fromEntries(Object.keys(spec.styles ?? {}).map((key) => [key, css.getPropertyValue(key).trim()])),
    };
  }), contract.elements);
  return evaluateMeasurements(contract, measurements);
}

export function evaluateMeasurements(contract: DesignContract, measurements: MeasurementResult["measurements"]): MeasurementResult {
  const issues: MeasurementIssue[] = [];
  const byName = new Map(measurements.map((value) => [value.name, value]));
  for (const element of contract.elements) {
    const measured = byName.get(element.name);
    const check = (property: string, expected: string | number, actual: string | number, tolerance = contract.tolerance ?? 1) => {
      const delta = typeof expected === "number" && typeof actual === "number" ? actual - expected : undefined;
      if (delta !== undefined ? Math.abs(delta) <= tolerance : expected === actual) return;
      issues.push({ id: JSON.stringify([element.name, property]), element: element.name, selector: element.selector, property, expected, actual, ...(delta !== undefined ? { delta, tolerance } : {}) });
    };
    if (!measured || measured.count !== 1) { check("matchCount", 1, measured?.count ?? 0, 0); continue; }
    if (!measured.visible || !measured.bounds) { check("visibility", "visible", "hidden"); continue; }
    for (const [key, value] of Object.entries(element.bounds ?? {})) check(`bounds.${key}`, value, measured.bounds[key as keyof typeof measured.bounds]);
    for (const [key, value] of Object.entries(element.styles ?? {})) {
      const raw = measured.styles[key] ?? "";
      const numeric = /^-?(?:\d+\.?\d*|\.\d+)px$/.test(raw) ? Number.parseFloat(raw) : raw;
      check(`styles.${key}`, value, typeof value === "number" ? numeric : raw);
    }
    for (const relation of element.relations ?? []) {
      const target = byName.get(relation.target);
      const property = `relations.${relation.metric}:${relation.target}`;
      if (!target?.visible || target.count !== 1 || !target.bounds) { check(property, relation.expected, "target unavailable"); continue; }
      const a = measured.bounds, b = target.bounds;
      const values = { gapY: a.y - b.y - b.height, gapX: a.x - b.x - b.width, alignLeft: a.x - b.x, alignTop: a.y - b.y, centerX: a.x + a.width / 2 - b.x - b.width / 2 };
      check(property, relation.expected, values[relation.metric], relation.tolerance ?? contract.tolerance ?? 1);
    }
  }
  return { passed: issues.length === 0, failOnMismatch: contract.failOnMismatch ?? true, measurements, issues };
}

export function measurementDelta(current: MeasurementResult, previous?: MeasurementResult): NonNullable<MeasurementResult["iteration"]> {
  const before = new Map((previous?.issues ?? []).map((issue) => [issue.id, issue]));
  const now = new Set(current.issues.map((issue) => issue.id));
  const result: NonNullable<MeasurementResult["iteration"]> = { baseline: !previous, added: [], resolved: [...before.keys()].filter((id) => !now.has(id)), improved: [], worsened: [], unchanged: [], stagnantRounds: 0, recommendImageReview: false };
  for (const issue of current.issues) {
    const old = before.get(issue.id);
    if (!old) result.added.push(issue.id);
    else if (issue.delta !== undefined && old.delta !== undefined && Math.abs(issue.delta) < Math.abs(old.delta)) result.improved.push(issue.id);
    else if (issue.delta !== undefined && old.delta !== undefined && Math.abs(issue.delta) > Math.abs(old.delta)) result.worsened.push(issue.id);
    else result.unchanged.push(issue.id);
  }
  if (previous && current.issues.length && !result.resolved.length && !result.improved.length) result.stagnantRounds = (previous.iteration?.stagnantRounds ?? 0) + 1;
  result.recommendImageReview = result.stagnantRounds >= 2;
  return result;
}

export async function recordMeasurement(result: MeasurementResult, historyPath: string, identity: unknown): Promise<void> {
  const key = hashValue(identity);
  let previous: MeasurementResult | undefined;
  try {
    const saved = JSON.parse(await fs.readFile(historyPath, "utf8"));
    if (saved.key === key && Array.isArray(saved.result?.issues)) previous = saved.result;
  } catch { /* Missing history starts a new baseline. */ }
  result.iteration = measurementDelta(result, previous);
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const temporary = `${historyPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ key, result }), "utf8");
  await fs.rename(temporary, historyPath);
}

export function summarizeMeasurement(result: MeasurementResult | undefined) {
  if (!result) return undefined;
  const iteration = result.iteration;
  const priority = new Set([...(iteration?.added ?? []), ...(iteration?.worsened ?? [])]);
  const issues = [...result.issues].sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)));
  return {
    passed: result.passed, issueCount: result.issues.length,
    issues: issues.slice(0, 8), omittedIssues: Math.max(0, result.issues.length - 8),
    ...(iteration ? { iteration: {
      baseline: iteration.baseline,
      counts: Object.fromEntries((["added", "resolved", "improved", "worsened", "unchanged"] as const).map((key) => [key, iteration[key].length])),
      resolved: iteration.resolved.slice(0, 8),
      stagnantRounds: iteration.stagnantRounds,
      recommendImageReview: iteration.recommendImageReview,
    } } : {}),
  };
}

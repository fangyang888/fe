import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  IntentPlan,
  VisualStructureIntent,
} from "./types.js";

export function structureFromIntentPlan(
  plan: IntentPlan,
): VisualStructureIntent | undefined {
  if (
    plan.schemaVersion !== 1 ||
    plan.kind !== "visual-qa-intent-plan"
  ) {
    throw new Error("Unsupported intent plan schema");
  }

  const unguarded = plan.regions.filter(
    (region) =>
      region.mode === "single-image" &&
      region.export !== false &&
      !region.selector,
  );
  if (unguarded.length > 0) {
    throw new Error(
      `Opaque image regions require selectors before verification: ${unguarded
        .map((region) => region.name)
        .join(", ")}`,
    );
  }

  const regions = plan.regions
    .filter(
      (region) =>
        region.mode === "single-image" &&
        region.export !== false &&
        Boolean(region.selector),
    )
    .map((region) => ({
      name: region.name,
      type: "single-image" as const,
      selector: region.selector!,
      requireNoVisibleChildren: true,
    }));

  return regions.length > 0
    ? { failOnMismatch: true, regions }
    : undefined;
}

export function mergeIntentStructure(
  configured: VisualStructureIntent | undefined,
  derived: VisualStructureIntent | undefined,
): VisualStructureIntent | undefined {
  if (!derived) return configured;
  if (!configured) return derived;

  const regions = [...configured.regions];
  for (const required of derived.regions) {
    const existing = regions.find(
      (region) => region.selector === required.selector,
    );
    if (!existing) {
      regions.push(required);
      continue;
    }
    if (
      existing.type !== "single-image" ||
      existing.requireNoVisibleChildren === false
    ) {
      throw new Error(
        `Intent plan requires ${required.selector} to remain one opaque image`,
      );
    }
  }

  return { failOnMismatch: true, regions };
}

export async function loadIntentStructure(
  planPath: string,
): Promise<VisualStructureIntent | undefined> {
  const plan = JSON.parse(
    await fs.readFile(path.resolve(planPath), "utf8"),
  ) as IntentPlan;
  return structureFromIntentPlan(plan);
}

import type { Locator, Page } from "playwright";
import type {
  ImageElementIntent,
  StructureCheckResult,
  StructureInspectionResult,
  StructureRegionResult,
  VisualRegionIntent,
  VisualStructureIntent,
} from "./types.js";

interface ElementEvidence {
  tagName: string;
  imageSource: string | null;
  visibleChildren: number;
  rect: { x: number; y: number; width: number; height: number };
}

function result(check: string, passed: boolean, message: string): StructureCheckResult {
  return { check, passed, message };
}

async function inspectElement(locator: Locator): Promise<ElementEvidence | null> {
  return locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const style = getComputedStyle(htmlElement);
    const imageSource =
      htmlElement instanceof HTMLImageElement
        ? htmlElement.currentSrc || htmlElement.src || null
        : style.backgroundImage !== "none" && style.backgroundImage.includes("url(")
          ? style.backgroundImage
          : null;
    const visibleChildren = [...htmlElement.querySelectorAll("*")].filter((child) => {
      const childElement = child as HTMLElement;
      const childStyle = getComputedStyle(childElement);
      const rect = childElement.getBoundingClientRect();
      return (
        childStyle.display !== "none" &&
        childStyle.visibility !== "hidden" &&
        Number(childStyle.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }).length;
    const rect = htmlElement.getBoundingClientRect();
    return {
      tagName: htmlElement.tagName.toLowerCase(),
      imageSource,
      visibleChildren,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}

async function inspectImageIntent(
  page: Page,
  intent: ImageElementIntent,
  label: string,
): Promise<{ evidence: ElementEvidence | null; checks: StructureCheckResult[] }> {
  const locator = page.locator(intent.selector);
  const count = await locator.count();
  const checks = [
    result(
      "unique-element",
      count === 1,
      count === 1
        ? `${label} matched one element (${intent.selector})`
        : `${label} expected one element but matched ${count} (${intent.selector})`,
    ),
  ];
  if (count !== 1) return { evidence: null, checks };

  const evidence = await inspectElement(locator.first());
  if (!evidence) return { evidence: null, checks };
  checks.push(
    result(
      "image-source",
      Boolean(evidence.imageSource),
      evidence.imageSource
        ? `${label} is rendered from ${evidence.tagName === "img" ? "an img element" : "a CSS background image"}`
        : `${label} is not rendered from an img element or CSS background image`,
    ),
  );
  if (intent.requireNoVisibleChildren !== false) {
    checks.push(
      result(
        "no-visible-children",
        evidence.visibleChildren === 0,
        evidence.visibleChildren === 0
          ? `${label} has no visible child elements`
          : `${label} has ${evidence.visibleChildren} visible child element(s)`,
      ),
    );
  }
  return { evidence, checks };
}

function intersects(
  left: ElementEvidence["rect"],
  right: ElementEvidence["rect"],
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function overflows(
  child: ElementEvidence["rect"],
  parent: ElementEvidence["rect"],
): boolean {
  return (
    child.x < parent.x ||
    child.y < parent.y ||
    child.x + child.width > parent.x + parent.width ||
    child.y + child.height > parent.y + parent.height
  );
}

async function isOverlayAboveBase(
  page: Page,
  baseSelector: string,
  overlaySelector: string,
): Promise<boolean | null> {
  return page.evaluate(
    ({ baseSelector: baseQuery, overlaySelector: overlayQuery }) => {
      const base = document.querySelector(baseQuery) as HTMLElement | null;
      const overlay = document.querySelector(overlayQuery) as HTMLElement | null;
      if (!base || !overlay) return null;

      const baseRect = base.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      const left = Math.max(baseRect.left, overlayRect.left);
      const right = Math.min(baseRect.right, overlayRect.right);
      const top = Math.max(baseRect.top, overlayRect.top);
      const bottom = Math.min(baseRect.bottom, overlayRect.bottom);
      if (left >= right || top >= bottom) return null;

      const stack = document.elementsFromPoint(
        (left + right) / 2,
        (top + bottom) / 2,
      );
      const overlayIndex = stack.findIndex(
        (element) => element === overlay || overlay.contains(element),
      );
      const baseIndex = stack.findIndex(
        (element) => element === base || base.contains(element),
      );
      if (overlayIndex >= 0 && baseIndex >= 0) return overlayIndex < baseIndex;

      const baseZIndex = Number.parseInt(getComputedStyle(base).zIndex, 10);
      const overlayZIndex = Number.parseInt(getComputedStyle(overlay).zIndex, 10);
      if (
        Number.isFinite(baseZIndex) &&
        Number.isFinite(overlayZIndex) &&
        baseZIndex !== overlayZIndex
      ) {
        return overlayZIndex > baseZIndex;
      }
      if (base.parentElement === overlay.parentElement) {
        return Boolean(
          base.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }
      return null;
    },
    { baseSelector, overlaySelector },
  );
}

async function inspectRegion(
  page: Page,
  region: VisualRegionIntent,
): Promise<StructureRegionResult> {
  if (region.type === "single-image") {
    const inspection = await inspectImageIntent(page, region, region.name);
    return {
      name: region.name,
      type: region.type,
      passed: inspection.checks.every((check) => check.passed),
      checks: inspection.checks,
    };
  }

  const container = page.locator(region.selector);
  const containerCount = await container.count();
  const checks: StructureCheckResult[] = [
    result(
      "unique-container",
      containerCount === 1,
      containerCount === 1
        ? `${region.name} matched one container (${region.selector})`
        : `${region.name} expected one container but matched ${containerCount} (${region.selector})`,
    ),
  ];
  const containerEvidence =
    containerCount === 1 ? await inspectElement(container.first()) : null;
  const base = await inspectImageIntent(page, region.base, `${region.name} base`);
  checks.push(...base.checks);

  if (containerEvidence && base.evidence) {
    checks.push(
      result(
        "base-inside-container",
        !overflows(base.evidence.rect, containerEvidence.rect),
        !overflows(base.evidence.rect, containerEvidence.rect)
          ? `${region.name} base is inside its container`
          : `${region.name} base extends outside its container`,
      ),
    );
  }

  for (const overlay of region.overlays) {
    const inspection = await inspectImageIntent(
      page,
      overlay,
      `${region.name} overlay ${overlay.name}`,
    );
    checks.push(...inspection.checks);
    if (!base.evidence || !inspection.evidence) continue;

    if (overlay.mustOverlap !== false) {
      const overlapsBase = intersects(base.evidence.rect, inspection.evidence.rect);
      checks.push(
        result(
          `overlay:${overlay.name}:overlaps-base`,
          overlapsBase,
          overlapsBase
            ? `${overlay.name} overlaps the base image`
            : `${overlay.name} does not overlap the base image`,
        ),
      );
    }
    if (overlay.mustOverflowBase) {
      const exceedsBase = overflows(inspection.evidence.rect, base.evidence.rect);
      checks.push(
        result(
          `overlay:${overlay.name}:overflows-base`,
          exceedsBase,
          exceedsBase
            ? `${overlay.name} extends outside the base image`
            : `${overlay.name} stays fully inside the base image`,
        ),
      );
    }
    if (overlay.mustBeAboveBase !== false) {
      const aboveBase = await isOverlayAboveBase(
        page,
        region.base.selector,
        overlay.selector,
      );
      checks.push(
        result(
          `overlay:${overlay.name}:above-base`,
          aboveBase === true,
          aboveBase === true
            ? `${overlay.name} is painted above the base image`
            : aboveBase === false
              ? `${overlay.name} is painted behind the base image`
              : `${overlay.name} stacking order could not be confirmed`,
        ),
      );
    }
  }

  return {
    name: region.name,
    type: region.type,
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export async function inspectVisualStructure(
  page: Page,
  intent: VisualStructureIntent,
): Promise<StructureInspectionResult> {
  const regions: StructureRegionResult[] = [];
  for (const region of intent.regions) {
    regions.push(await inspectRegion(page, region));
  }
  return {
    passed: regions.every((region) => region.passed),
    failOnMismatch: intent.failOnMismatch ?? true,
    regions,
  };
}

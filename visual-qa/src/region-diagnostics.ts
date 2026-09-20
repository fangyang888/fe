import type { Page } from "playwright";
import type { DifferenceRegion, DomRegionCandidate } from "./types.js";

/** Inspect the same live page that produced the screenshot. No page text or full DOM is returned. */
export async function associateDifferenceRegions(
  page: Page, regions: DifferenceRegion[], fullPage: boolean,
): Promise<string | undefined> {
  if (!regions.length) return;
  const result = await page.evaluate(({ regions, fullPage }) => {
    const scale = window.devicePixelRatio;
    const originX = fullPage ? window.scrollX : 0;
    const originY = fullPage ? window.scrollY : 0;
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: (rect.x + originX) * scale, y: (rect.y + originY) * scale,
        width: rect.width * scale, height: rect.height * scale };
    };
    const selector = (element: Element): string => {
      if (element.id) {
        const value = `#${CSS.escape(element.id)}`;
        if (document.querySelectorAll(value).length === 1) return value;
      }
      const visual = element.getAttribute("data-visual");
      if (visual) {
        const value = `[data-visual="${CSS.escape(visual)}"]`;
        if (document.querySelectorAll(value).length === 1) return value;
      }
      const parts: string[] = [];
      let current: Element | null = element;
      while (current) {
        const parent: Element | null = current.parentElement;
        parts.unshift(`${CSS.escape(current.localName)}${parent ? `:nth-child(${Array.from(parent.children).indexOf(current) + 1})` : ""}`);
        current = parent;
      }
      return parts.join(" > ");
    };
    const styles = (element: Element) => {
      const computed = getComputedStyle(element);
      return Object.fromEntries(["display", "position", "width", "height", "font-family", "font-size", "font-weight",
        "line-height", "color", "background-color", "padding", "margin", "gap", "align-items",
        "justify-content", "transform", "overflow", "z-index"].map(key => [key, computed.getPropertyValue(key)]));
    };
    const all: Element[] = [];
    const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node && all.length < 5000) { all.push(node as Element); node = walker.nextNode(); }
    const truncated = node !== null;
    const visible = all.filter(element => {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const css = getComputedStyle(element);
      if (css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).map(element => ({ element, box: bounds(element) }));
    const candidates = regions.map(region => {
      const ranked = visible.map(({ element, box }) => {
        const intersection = Math.max(0, Math.min(region.x + region.width, box.x + box.width) - Math.max(region.x, box.x)) *
          Math.max(0, Math.min(region.y + region.height, box.y + box.height) - Math.max(region.y, box.y));
        const union = region.width * region.height + box.width * box.height - intersection;
        return { element, box, intersection, score: union ? intersection / union : 0 };
      }).filter(item => item.intersection > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      return ranked.map(({ element, box, intersection }) => ({
        selector: selector(element), bounds: box, styles: styles(element),
        overlap: intersection / (region.width * region.height),
        ...(element.parentElement ? { parent: {
          selector: selector(element.parentElement), bounds: bounds(element.parentElement), styles: styles(element.parentElement),
        } } : {}),
      }));
    });
    return { candidates, truncated };
  }, { regions: regions.map(({ x, y, width, height }) => ({ x, y, width, height })), fullPage });
  regions.forEach((region, index) => { region.domCandidates = result.candidates[index] as DomRegionCandidate[]; });
  return result.truncated ? "DOM inspection limited to the first 5000 main-document elements; candidates may be incomplete" : undefined;
}

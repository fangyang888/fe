import type { Page } from "playwright";
import type {
  CssRuleViolation,
  CssRulesConfig,
  CssRulesInspectionResult,
} from "./types.js";

type NormalizedCssRules = Required<CssRulesConfig>;

export async function inspectCssRules(
  page: Page,
  rules: NormalizedCssRules,
): Promise<CssRulesInspectionResult> {
  const violations = await page.evaluate(
    ({
      allowGap,
      ignoreSelectors,
      pageShellSelector,
      positionContextMaxDepth,
      preferFlex,
      preferResponsivePage,
      rejectSuspiciousCss,
      scopeSelector,
    }) => {
      const scope = document.querySelector(scopeSelector);
      if (!scope) {
        return [
          {
            rule: "page-shell" as const,
            severity: "error" as const,
            selector: scopeSelector,
            display: "missing",
            rowGap: "normal",
            columnGap: "normal",
            message: `CSS rule scope was not found: ${scopeSelector}`,
          },
        ];
      }

      const isIgnored = (element: Element) =>
        ignoreSelectors.some((selector) => {
          try {
            return element.matches(selector) || Boolean(element.closest(selector));
          } catch {
            return false;
          }
        });
      const selectorFor = (element: Element): string => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.id) return `#${htmlElement.id}`;
        const classes = [...htmlElement.classList].slice(0, 2);
        if (classes.length > 0) {
          return `${htmlElement.tagName.toLowerCase()}.${classes.join(".")}`;
        }
        const parent = htmlElement.parentElement;
        if (!parent) return htmlElement.tagName.toLowerCase();
        const siblings = [...parent.children].filter(
          (child) => child.tagName === htmlElement.tagName,
        );
        const suffix =
          siblings.length > 1
            ? `:nth-of-type(${siblings.indexOf(htmlElement) + 1})`
            : "";
        return `${htmlElement.tagName.toLowerCase()}${suffix}`;
      };
      const hasGap = (value: string) =>
        value !== "normal" && value !== "0" && value !== "0px";
      const results: CssRuleViolation[] = [];
      const elements = [scope, ...scope.querySelectorAll("*")];
      const isVisible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      for (const element of elements) {
        if (isIgnored(element)) continue;
        const htmlElement = element as HTMLElement;
        const style = getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          continue;
        }

        const display = style.display;
        const isGrid = display === "grid" || display === "inline-grid";
        const isFlex = display === "flex" || display === "inline-flex";
        const selector = selectorFor(element);

        if (preferFlex && isGrid) {
          results.push({
            rule: "prefer-flex",
            severity: "error",
            selector,
            display,
            rowGap: style.rowGap,
            columnGap: style.columnGap,
            message: `${selector} uses ${display}; use a flex layout for iOS 8 and Android 4 compatibility`,
          });
        }
        if (
          !allowGap &&
          (isFlex || isGrid) &&
          (hasGap(style.rowGap) || hasGap(style.columnGap))
        ) {
          results.push({
            rule: "no-gap",
            severity: "error",
            selector,
            display,
            rowGap: style.rowGap,
            columnGap: style.columnGap,
            message: `${selector} uses gap; use child margins for iOS 8 and Android 4 compatibility`,
          });
        }
      }

      const pageShells = new Set<Element>();
      try {
        if (scope.matches(pageShellSelector)) pageShells.add(scope);
        for (const element of scope.querySelectorAll(pageShellSelector)) {
          if (!isIgnored(element) && isVisible(element)) pageShells.add(element);
        }
      } catch {
        results.push({
          rule: "page-shell",
          severity: "error",
          selector: pageShellSelector,
          display: "invalid-selector",
          rowGap: "normal",
          columnGap: "normal",
          message: `Invalid cssRules.pageShellSelector: ${pageShellSelector}`,
        });
      }
      if (preferResponsivePage && pageShells.size === 0) {
        results.push({
          rule: "page-shell",
          severity: "error",
          selector: pageShellSelector,
          display: "missing",
          rowGap: "normal",
          columnGap: "normal",
          message: `Page shell was not found inside ${scopeSelector}: ${pageShellSelector}`,
        });
      }
      const fixedPixels = /^-?\d+(?:\.\d+)?px$/;
      const overPrecisePixels = /-?\d+\.\d{3,}px/;
      const dataImage = /url\(["']?data:image\//i;
      const inspectAuthoredStyle = (
        element: Element,
        selector: string,
        declaration: CSSStyleDeclaration,
      ) => {
        const computed = getComputedStyle(element as HTMLElement);
        const addViolation = (
          rule: CssRuleViolation["rule"],
          severity: CssRuleViolation["severity"],
          property: string,
          value: string,
          message: string,
        ) => {
          results.push({
            rule,
            severity,
            selector,
            display: computed.display,
            rowGap: computed.rowGap,
            columnGap: computed.columnGap,
            property,
            value,
            message,
          });
        };

        if (preferResponsivePage && pageShells.has(element)) {
          for (const property of ["width", "height", "min-width", "min-height"]) {
            const value = declaration.getPropertyValue(property).trim();
            if (fixedPixels.test(value)) {
              addViolation(
                "responsive-page-size",
                "error",
                property,
                value,
                `${selector} fixes the page shell ${property} to ${value}; use percentage, viewport, min/max constraints, or content-driven sizing`,
              );
            }
          }
        }

        if (!rejectSuspiciousCss) return;
        for (const property of Array.from(declaration)) {
          const value = declaration.getPropertyValue(property).trim();
          if (overPrecisePixels.test(value)) {
            addViolation(
              "suspicious-css",
              "warning",
              property,
              value,
              `${selector} uses generated-looking sub-pixel precision in ${property}; round to a maintainable value`,
            );
          }
          if (dataImage.test(value)) {
            addViolation(
              "suspicious-css",
              "warning",
              property,
              value,
              `${selector} embeds a data image in CSS; use a real asset or a native CSS value`,
            );
          }
          if (property === "zoom") {
            addViolation(
              "suspicious-css",
              "warning",
              property,
              value,
              `${selector} uses zoom for layout; use responsive sizing instead`,
            );
          }
        }

        const position = declaration.getPropertyValue("position").trim();
        const hasHorizontalOverconstraint =
          Boolean(declaration.getPropertyValue("width")) &&
          Boolean(declaration.getPropertyValue("left")) &&
          Boolean(declaration.getPropertyValue("right"));
        const hasVerticalOverconstraint =
          Boolean(declaration.getPropertyValue("height")) &&
          Boolean(declaration.getPropertyValue("top")) &&
          Boolean(declaration.getPropertyValue("bottom"));
        if (
          (position === "absolute" || position === "fixed") &&
          (hasHorizontalOverconstraint || hasVerticalOverconstraint)
        ) {
          addViolation(
            "suspicious-css",
            "warning",
            "position",
            position,
            `${selector} over-constrains absolute geometry; keep only the dimensions and offsets that determine the layout`,
          );
        }
      };

      const inspectRule = (rule: CSSRule) => {
        if (rule instanceof CSSStyleRule) {
          for (const selector of rule.selectorText.split(",")) {
            const trimmed = selector.trim();
            let matched: Element | null = null;
            try {
              matched = scope.matches(trimmed) ? scope : scope.querySelector(trimmed);
            } catch {
              continue;
            }
            if (!matched || isIgnored(matched) || !isVisible(matched)) continue;
            inspectAuthoredStyle(matched, trimmed, rule.style);
          }
          return;
        }
        const grouping = rule as CSSRule & { cssRules?: CSSRuleList };
        if (grouping.cssRules) {
          for (const child of Array.from(grouping.cssRules)) inspectRule(child);
        }
      };

      for (const styleSheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(styleSheet.cssRules)) inspectRule(rule);
        } catch {
          // Cross-origin stylesheets cannot be inspected; computed layout checks still run.
        }
      }
      for (const element of elements) {
        if (isIgnored(element) || !isVisible(element)) continue;
        const inlineStyle = (element as HTMLElement).style;
        if (inlineStyle.length > 0) {
          inspectAuthoredStyle(element, selectorFor(element), inlineStyle);
        }
      }

      for (const element of elements) {
        if (element === scope || isIgnored(element) || !isVisible(element)) continue;
        const computed = getComputedStyle(element as HTMLElement);
        if (computed.position !== "absolute") continue;

        let ancestor: HTMLElement | null = element.parentElement;
        let depth = 1;
        let positionedAncestor: Element | null = null;
        while (ancestor) {
          if (getComputedStyle(ancestor as HTMLElement).position !== "static") {
            positionedAncestor = ancestor;
            break;
          }
          if (ancestor === scope) break;
          ancestor = ancestor.parentElement;
          depth += 1;
        }

        const selector = selectorFor(element);
        if (!positionedAncestor) {
          results.push({
            rule: "absolute-position-context",
            severity: "error",
            selector,
            display: computed.display,
            rowGap: computed.rowGap,
            columnGap: computed.columnGap,
            property: "position",
            value: "absolute",
            message: `${selector} has no positioned ancestor inside ${scopeSelector}; add position: relative to its nearest layout container`,
          });
        } else if (depth > positionContextMaxDepth) {
          results.push({
            rule: "absolute-position-context",
            severity: "warning",
            selector,
            display: computed.display,
            rowGap: computed.rowGap,
            columnGap: computed.columnGap,
            property: "position",
            value: "absolute",
            message: `${selector} is positioned against ${selectorFor(positionedAncestor)} ${depth} levels away; prefer a nearer business container with position: relative`,
          });
        }
      }

      const seen = new Set<string>();
      return results.filter((violation) => {
        const key = [
          violation.rule,
          violation.selector,
          violation.property ?? "",
          violation.value ?? "",
        ].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    rules,
  );

  const counts = violations.reduce(
    (result, violation) => {
      result[violation.severity] += 1;
      return result;
    },
    { error: 0, warning: 0, info: 0 },
  );
  const passed =
    counts.error === 0 &&
    (rules.failOnSeverity !== "warning" || counts.warning === 0);

  return {
    passed,
    failOnMismatch: rules.failOnMismatch,
    failOnSeverity: rules.failOnSeverity,
    preferFlex: rules.preferFlex,
    allowGap: rules.allowGap,
    preferResponsivePage: rules.preferResponsivePage,
    rejectSuspiciousCss: rules.rejectSuspiciousCss,
    scopeSelector: rules.scopeSelector,
    pageShellSelector: rules.pageShellSelector,
    positionContextMaxDepth: rules.positionContextMaxDepth,
    counts,
    violations,
  };
}

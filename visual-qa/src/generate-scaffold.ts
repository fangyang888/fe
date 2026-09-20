import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createGenerationContext, type GenerationNode } from "./generation-context.js";

type Context = ReturnType<typeof createGenerationContext>;
export interface ScaffoldOptions {
  unit: "px" | "rem";
  rootFontSize?: number;
  assets: Record<string, { src: string; alt: string }>;
  selectors?: Record<string, string>;
  /** Only explicit local positioning is emitted; Pixso x/y may be absolute. */
  layout?: Record<string, { mode: "row" | "column" | "absolute"; left?: number; top?: number }>;
}
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function selectorAttribute(selector: string): [string, string] {
  if (/^#[A-Za-z_][\w-]*$/.test(selector)) return ["id", selector.slice(1)];
  if (/^\.[A-Za-z_][\w-]*$/.test(selector)) return ["class", selector.slice(1)];
  const data = selector.match(/^\[(data-[a-z][\w-]*)=['"]([^'"<>]+)['"]\]$/);
  if (data) return [data[1], data[2]];
  throw new Error(`Scaffold requires a simple #id, .class or [data-name='value'] selector: ${selector}`);
}

export function generateScaffold(context: Context, options: ScaffoldOptions) {
  if (context.kind !== "visual-qa-generation-context" || context.status !== "ready" || context.schemaVersion !== 1 || !context.tree) throw new Error("A ready generation-context is required");
  if (!["px", "rem"].includes(options.unit)) throw new Error("Choose the project's explicit unit: px or rem");
  if (options.unit === "rem" && (!Number.isFinite(options.rootFontSize) || options.rootFontSize! <= 0)) throw new Error("rem requires the project's rootFontSize");
  const length = (value: number) => `${Number((value / (options.unit === "rem" ? options.rootFontSize! : 1)).toFixed(6))}${options.unit}`;
  const issues: Array<{ nodeId: string; message: string }> = [];
  const rules: string[] = [];
  const bindings: Array<{ nodeId: string; selector: string; src?: string }> = [];
  const seen = new Set<string>();
  const assignedSelectors = new Set<string>();
  const visit = (node: GenerationNode, depth: number): string => {
    if (!node.nodeId || seen.has(node.nodeId)) throw new Error("Invalid or duplicate scaffold node");
    seen.add(node.nodeId);
    const p = node.properties;
    const isImage = node.representation === "single-image";
    const cssClass = `vqa-${createHash("sha256").update(node.nodeId).digest("hex").slice(0, 16)}`;
    const selector = node.selector ?? options.selectors?.[node.nodeId] ?? `[data-vqa-node='${node.nodeId}']`;
    if (assignedSelectors.has(selector)) throw new Error(`Duplicate selector: ${selector}`);
    assignedSelectors.add(selector);
    const [attr, value] = selectorAttribute(selector);
    const attrs = `class="${cssClass}${attr === "class" ? ` ${escape(value)}` : ""}"${attr === "class" ? "" : ` ${attr}="${escape(value)}"`}`;
    const declarations = ["box-sizing: border-box;"];
    const issue = (message: string) => issues.push({ nodeId: node.nodeId, message });
    if (depth === 0) declarations.push("width: 100%;", "position: relative;");
    else for (const key of ["width", "height"] as const) {
      if (typeof p[key] === "number" && Number.isFinite(p[key]) && p[key] >= 0) declarations.push(`${key}: ${length(p[key])};`);
      else if (isImage) issue(`Missing numeric ${key}; resolve image outer bounds`);
    }
    const layout = options.layout?.[node.nodeId];
    if (layout && !["row", "column", "absolute"].includes(layout.mode)) throw new Error("Unknown layout mode");
    const mode = layout?.mode ?? (p.layoutMode === "HORIZONTAL" ? "row" : p.layoutMode === "VERTICAL" ? "column" : undefined);
    if (p.layoutPositioning !== undefined && mode !== "absolute") issue("Review layoutPositioning; supply local coordinates for absolute overlays");
    if (isImage) for (const field of ["transform", "zIndex", "constraints", "blendMode", "isMask"]) {
      if (p[field] !== undefined) issue(`Review image outer ${field}; not translated automatically`);
    }
    if (!isImage) {
      if (typeof p.nodeText === "string") declarations.push("white-space: pre-wrap;");
      if (mode === "row" || mode === "column") {
        declarations.push("display: flex;", `flex-direction: ${mode};`);
        if (typeof p.itemSpacing === "number" && Number.isFinite(p.itemSpacing)) {
          rules.push(`.${cssClass} > * + * { margin-${mode === "row" ? "left" : "top"}: ${length(p.itemSpacing)}; }`);
        }
      } else if ((node.children?.length ?? 0) > 0) issue("Resolve container flow/alignment from design before final verification");
      declarations.push("position: relative;");
      const lengths = { paddingTop: "padding-top", paddingRight: "padding-right", paddingBottom: "padding-bottom", paddingLeft: "padding-left", fontSize: "font-size", letterSpacing: "letter-spacing", cornerRadius: "border-radius" };
      for (const [field, property] of Object.entries(lengths)) {
        if (typeof p[field] === "number" && Number.isFinite(p[field])) declarations.push(`${property}: ${length(p[field] as number)};`);
      }
      if (typeof p.opacity === "number" && p.opacity >= 0 && p.opacity <= 1) declarations.push(`opacity: ${p.opacity};`);
      if (typeof p.fontWeight === "number" && p.fontWeight >= 1 && p.fontWeight <= 1000) declarations.push(`font-weight: ${p.fontWeight};`);
      if (p.clipsContent === true) declarations.push("overflow: hidden;");
      for (const field of ["fillPaints", "strokePaints", "fontName", "lineHeight", "textAlignHorizontal", "constraints", "blendMode", "isMask", "transform", "zIndex"]) {
        if (p[field] !== undefined) issue(`Review ${field}; not translated automatically`);
      }
    }
    if (mode === "absolute") {
      if (!Number.isFinite(layout?.left) || !Number.isFinite(layout?.top)) throw new Error(`Explicit local left/top required: ${node.nodeId}`);
      declarations.push("position: absolute;", `left: ${length(layout!.left!)};`, `top: ${length(layout!.top!)};`);
    }
    if (isImage) declarations.push("display: block;", "object-fit: contain;", "flex-shrink: 0;");
    if (p.visible === false) declarations.push("display: none;");
    rules.push(`.${cssClass} {\n  ${declarations.join("\n  ")}\n}`);
    const pad = "  ".repeat(depth);
    if (isImage) {
      if (node.children?.length) throw new Error("Opaque image must not contain children");
      const asset = options.assets?.[node.nodeId];
      if (asset && (typeof asset.src !== "string" || typeof asset.alt !== "string" || !/^(?:\.?\.?\/|[a-zA-Z0-9_-])/.test(asset.src) || /[:\\\x00-\x20]/.test(asset.src) || asset.src.startsWith("//"))) throw new Error(`Use a local asset URL and explicit alt text: ${node.nodeId}`);
      bindings.push({ nodeId: node.nodeId, selector, src: asset?.src });
      if (!asset) {
        issue("Missing local image asset; unstyled placeholder emitted");
        return `${pad}<div ${attrs}></div>`;
      }
      return `${pad}<img ${attrs} src="${escape(asset.src)}" alt="${escape(asset.alt)}">`;
    }
    let text = "";
    if (typeof p.nodeText === "string") text = escape(p.nodeText);
    else if (p.nodeText !== undefined) issue("Structured text requires adaptation; not flattened automatically");
    const children = (node.children ?? []).map((child) => visit(child, depth + 1));
    return `${pad}<div ${attrs}>${text}${children.length ? `\n${children.join("\n")}\n${pad}` : ""}</div>`;
  };
  const html = visit(context.tree, 0);
  for (const id of [...Object.keys(options.assets ?? {}), ...Object.keys(options.layout ?? {}), ...Object.keys(options.selectors ?? {})]) {
    if (!seen.has(id)) throw new Error(`Unknown configuration node: ${id}`);
  }
  for (const image of context.images) {
    if (image.groupSelector && !assignedSelectors.has(image.groupSelector)) issues.push({ nodeId: image.nodeId!, message: `Bind composite container selector ${image.groupSelector} using options.selectors` });
  }
  return { html: `${html}\n`, css: `${rules.join("\n\n")}\n`,
    manifest: { kind: "visual-qa-scaffold", schemaVersion: 1, status: "draft", unit: options.unit, rootFontSize: options.rootFontSize, bindings, issues,
      next: "Integrate HTML/CSS into the existing framework, resolve issues and run adaptive verification" } };
}

export async function writeScaffold(context: Context, options: ScaffoldOptions, output: string) {
  const result = generateScaffold(context, options);
  const dir = path.resolve(output);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  // A new output directory protects hand edits and previous iterations.
  await fs.mkdir(dir);
  await Promise.all([
    fs.writeFile(path.join(dir, "fragment.html"), result.html),
    fs.writeFile(path.join(dir, "styles.css"), result.css),
    fs.writeFile(path.join(dir, "scaffold.json"), `${JSON.stringify(result.manifest, null, 2)}\n`),
  ]);
  return { status: "draft", output: dir, issues: result.manifest.issues.length, assets: result.manifest.bindings.length };
}

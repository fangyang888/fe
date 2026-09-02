import type { ComponentMetadata } from "./types.js";

type EmbeddingFields = Omit<
  ComponentMetadata,
  "embeddingText" | "id" | "keywords" | "scope" | "usageCount" | "usedBy"
>;

export function createEmbeddingText(component: EmbeddingFields): string {
  const props = component.props
    .map((prop) => `${prop.name}${prop.required ? "" : "?"}: ${prop.type}`)
    .join(", ");

  return [
    `Component: ${component.name}`,
    `Framework: ${component.framework}`,
    `Description: ${component.description}`,
    component.useCases.length ? `Use cases: ${component.useCases.join("; ")}` : "",
    props ? `Props: ${props}` : "",
    component.hooks.length ? `Hooks: ${component.hooks.join(", ")}` : "",
    component.renderedElements.length
      ? `Rendered elements: ${component.renderedElements.join(", ")}`
      : "",
    `Source path: ${component.sourcePath}`,
    `Export: ${component.exportKind} from ${component.exportPath}`,
  ]
    .filter(Boolean)
    .join("\n");
}

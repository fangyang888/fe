import path from "node:path";
import type { ExtractedComponent } from "./types.js";

function cleanComment(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .filter((line) => line && !line.startsWith("@"))
    .join(" ");
}

export function extractVueComponents(
  fileName: string,
  content: string,
): ExtractedComponent[] {
  const name = path.basename(fileName, ".vue");
  if (!/^[A-Z][\w$]*$/.test(name)) return [];

  const comment = [...content.matchAll(/\/\*\*([\s\S]*?)\*\//g)].at(-1)?.[1] ?? "";
  const useCases = [...content.matchAll(/@use-case\s+([^\n*]+)/g)].map((match) =>
    match[1].trim(),
  );
  const hooks = [...content.matchAll(/\b(use[A-Z][\w$]*)\s*\(/g)].map(
    (match) => match[1],
  );
  const template = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i)?.[1] ?? "";
  const renderedElements = [...template.matchAll(/<([A-Za-z][\w.-]*)\b/g)].map(
    (match) => match[1],
  );

  return [
    {
      name,
      description: cleanComment(comment) || `Project component ${name}`,
      framework: "vue",
      parser: "vue-sfc-heuristic",
      exportKind: "default",
      status: /@deprecated\b/.test(content) ? "deprecated" : "stable",
      useCases,
      props: [],
      imports: [...content.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1],
      ),
      hooks: [...new Set(hooks)],
      renderedElements: [...new Set(renderedElements)],
      sourceSnippet: content.slice(0, 8_000),
    },
  ];
}

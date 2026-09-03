import type { ComponentProp } from "../types.js";

export interface ExtractedComponent {
  name: string;
  description: string;
  framework: "react" | "vue" | "arkui";
  parser: "typescript-ast" | "vue-sfc-heuristic" | "arkts-ast";
  exportKind: "named" | "default";
  status: "stable" | "deprecated";
  useCases: string[];
  props: ComponentProp[];
  imports: string[];
  hooks: string[];
  renderedElements: string[];
  sourceSnippet: string;
}

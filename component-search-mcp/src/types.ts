export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ComponentMetadata {
  id: string;
  name: string;
  description: string;
  scope: "project";
  framework: "react" | "vue";
  parser: "typescript-ast" | "vue-sfc-heuristic";
  projectName: string;
  sourcePath: string;
  exportPath: string;
  exportKind: "named" | "default";
  status: "stable" | "deprecated";
  keywords: string[];
  useCases: string[];
  props: ComponentProp[];
  imports: string[];
  hooks: string[];
  renderedElements: string[];
  sourceSnippet: string;
  embeddingText: string;
  usageCount: number;
  usedBy: string[];
}

export interface SourceFileFingerprint {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ComponentIndex {
  schemaVersion: 3;
  generatedAt: string;
  projectRoot: string;
  projectName: string;
  sourceRoots: string[];
  sourceFingerprint: string;
  sourceFiles: SourceFileFingerprint[];
  components: ComponentMetadata[];
}

export interface SearchOptions {
  limit?: number;
  includeDeprecated?: boolean;
}

export interface ComponentSearchMatch extends ComponentMetadata {
  score: number;
  matchScore: number;
  matchReason: string[];
  importExample: string;
}

export interface ComponentSearchResult {
  [key: string]: unknown;
  query: string;
  projectRoot: string;
  projectName: string;
  sourceRoots: string[];
  total: number;
  results: ComponentSearchMatch[];
}

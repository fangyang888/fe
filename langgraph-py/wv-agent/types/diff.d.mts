export interface BridgeCallResult {
  status: string;
  path?: string;
  params?: Record<string, any>;
  data?: any;
  error?: string;
  durationMs?: number;
}

export interface BridgeContractFieldRule {
  type?: string | string[];
  required?: boolean;
  nonEmpty?: boolean;
  minLength?: number;
  minItems?: number;
  format?: string;
  pattern?: string;
  enum?: unknown[];
  properties?: Record<string, string | BridgeContractFieldRule>;
}

export type BridgeContractSchema =
  | {
      type?: string;
      required?: string[];
      properties: Record<string, string | BridgeContractFieldRule>;
    }
  | Record<string, string | BridgeContractFieldRule>;

export interface BridgeDiffItem {
  kind: string;
  severity: 'error' | 'warn';
  field: string;
  device?: string;
  detail: string;
  values?: Record<string, string>;
}

export interface BridgeDiffOptions {
  ignoreFields?: string[];
  checkValues?: boolean;
  contract?: BridgeContractSchema | null;
  schema?: BridgeContractSchema | null;
}

export interface BridgeDiffSummary {
  passed: boolean;
  deviceCount: number;
  resolvedCount: number;
  errorCount: number;
  warnCount: number;
  byKind: Record<string, number>;
}

export interface FormatDiffMarkdownInput {
  path: string;
  params?: Record<string, any>;
  results: Record<string, BridgeCallResult>;
  diffs: BridgeDiffItem[];
  summary?: BridgeDiffSummary;
}

export declare function detectSemanticFormat(v: unknown): string | null;

export declare function validateBridgeContract(
  resultsByDevice: Record<string, BridgeCallResult>,
  contract: BridgeContractSchema,
  options?: { ignoreFields?: string[] }
): BridgeDiffItem[];

export declare function diffBridgeResults(
  resultsByDevice: Record<string, BridgeCallResult>,
  options?: BridgeDiffOptions
): BridgeDiffItem[];

export declare function summarizeBridgeDiff(
  resultsByDevice: Record<string, BridgeCallResult>,
  diffs: BridgeDiffItem[]
): BridgeDiffSummary;

export declare function formatDiffMarkdown(input: FormatDiffMarkdownInput): string;

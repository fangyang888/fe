import type {
  AdaptiveVerificationWorkflow,
  ResolvedVerificationMode,
  VerificationReport,
} from "./types.js";

export function resolveAdaptiveMode(
  previous: VerificationReport | undefined,
  designHash: string,
): ResolvedVerificationMode {
  if (
    !previous ||
    previous.workflow?.requestedMode !== "adaptive" ||
    previous.cache.designHash !== designHash
  ) {
    return "agent";
  }
  if (previous.mode === "final") {
    return previous.status === "passed" ? "final" : "agent";
  }
  return "quick";
}

function mismatchImproved(
  previous: VerificationReport | undefined,
  report: VerificationReport,
): boolean {
  const before = previous?.comparison.mismatchPercent;
  const after = report.comparison.mismatchPercent;
  if (typeof before !== "number" || typeof after !== "number") return true;
  const meaningfulDelta = Math.max(0.01, before * 0.01);
  return before - after >= meaningfulDelta;
}

export function createAdaptiveWorkflow(
  previous: VerificationReport | undefined,
  report: VerificationReport,
  options: {
    autoFinalized?: boolean;
    candidateMismatchPercent?: number;
    hasDiagnosticCrops?: boolean;
  } = {},
): AdaptiveVerificationWorkflow {
  const isFailedIteration = report.mode === "quick" && report.status === "failed";
  const previousStagnantRounds =
    previous?.workflow?.requestedMode === "adaptive"
      ? previous.workflow.pixelStagnantRounds
      : 0;
  const pixelStagnantRounds = isFailedIteration
    ? mismatchImproved(previous, report)
      ? 0
      : previousStagnantRounds + 1
    : 0;
  const hasDiagnosticCrops =
    options.hasDiagnosticCrops ?? Boolean(report.artifacts.diagnosticCrops?.length);

  return {
    requestedMode: "adaptive",
    phase:
      report.mode === "final"
        ? "final"
        : report.mode === "agent"
          ? "diagnostic"
          : "iteration",
    effectiveMode: report.mode,
    autoFinalized: options.autoFinalized ?? false,
    pixelStagnantRounds,
    nextAction:
      report.status === "passed" && report.mode === "final"
        ? "complete"
        : hasDiagnosticCrops
          ? "inspect-diagnostic-crops"
          : "fix-local-differences",
    ...(typeof options.candidateMismatchPercent === "number"
      ? { candidateMismatchPercent: options.candidateMismatchPercent }
      : {}),
  };
}

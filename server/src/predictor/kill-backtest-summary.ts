type KillBacktestRow = {
  predictedNumber: number;
  actualNumbers: number[];
  success: boolean;
};

/** Input is chronological, with seven normalized draw numbers (n7 at index 6). */
export function summarizeKillBacktest<T extends KillBacktestRow>(rows: readonly T[]) {
  let successCount = 0;
  let specialCodeMissCount = 0;
  for (const row of rows) {
    if (row.success) successCount++;
    if (row.predictedNumber !== row.actualNumbers[6]) specialCodeMissCount++;
  }

  return {
    kind: 'walk-forward',
    count: rows.length,
    successCount,
    failureCount: rows.length - successCount,
    successRate: rows.length ? successCount / rows.length : 0,
    specialCodeMissCount,
    specialCodeHitCount: rows.length - specialCodeMissCount,
    specialCodeMissRate: rows.length ? specialCodeMissCount / rows.length : 0,
    rows: rows.slice().reverse(),
    failureRows: rows.filter((row) => !row.success).reverse(),
  };
}

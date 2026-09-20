import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { recordRegionHistory } from "../src/region-history.js";

const box = { x: 0, y: 0, width: 10, height: 10, mismatchPixels: 50, mismatchPercent: 50 };
test("regional history measures old boxes even when absent from top regions, and resets by identity", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "region-history-"));
  const file = path.join(dir, "diff.png"), history = path.join(dir, "history.json");
  const write = async (count: number) => {
    const png = new PNG({ width: 20, height: 20 });
    for (let i = 0; i < count; i++) png.data[(Math.floor(i / 10) * 20 + i % 10) * 4 + 3] = 255;
    await fs.writeFile(file, PNG.sync.write(png));
  };
  try {
    await write(50);
    const first = await recordRegionHistory(file, [box], history, "a");
    assert.equal(first.baselineReset, true);
    assert.equal(first.counts.new, 1);
    await write(20);
    const improved = await recordRegionHistory(file, [], history, "a");
    assert.equal(improved.counts.improved, 1);
    assert.equal(improved.regions[0]!.delta, -30);
    await write(40);
    assert.equal((await recordRegionHistory(file, [], history, "a")).counts.worsened, 1);
    assert.equal((await recordRegionHistory(file, [], history, "a")).counts.unchanged, 1);
    await write(0);
    assert.equal((await recordRegionHistory(file, [], history, "a", false)).counts.resolved, 1);
    // Deferred candidate does not consume the change before auto-final.
    assert.equal((await recordRegionHistory(file, [], history, "a")).counts.resolved, 1);
    await write(50);
    assert.equal((await recordRegionHistory(file, [box], history, "b")).baselineReset, true);
    await fs.writeFile(history, '{"version":1,"regions":null}');
    assert.equal((await recordRegionHistory(file, [box], history, "b")).baselineReset, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

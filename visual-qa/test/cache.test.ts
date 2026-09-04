import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  changedRegions,
  emptyCache,
  hashFile,
  hashValue,
  readCache,
  writeCache,
} from "../src/cache.js";

test("maps changed files to configured visual regions", () => {
  const regions = changedRegions(
    ["src/header/title.tsx", "src/footer.tsx"],
    [
      {
        name: "header",
        bounds: { x: 0, y: 0, width: 375, height: 120 },
        sourcePatterns: ["src/header/**"],
      },
      {
        name: "card",
        bounds: { x: 20, y: 120, width: 335, height: 200 },
        sourcePatterns: ["src/card/**"],
      },
    ],
  );

  assert.deepEqual(regions.map((region) => region.name), ["header"]);
});

test("creates stable hashes for cached structured context", () => {
  assert.equal(hashValue({ a: 1, b: [2] }), hashValue({ a: 1, b: [2] }));
  assert.notEqual(hashValue({ a: 1 }), hashValue({ a: 2 }));
});

test("persists file hashes in cache.json", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-qa-cache-"));
  const filePath = path.join(directory, "asset.png");
  const cachePath = path.join(directory, "cache.json");
  await fs.writeFile(filePath, "asset-content");
  const cache = emptyCache();
  cache.assets[filePath] = {
    hash: await hashFile(filePath),
    size: 13,
    modifiedAt: 1,
  };

  await writeCache(cachePath, cache);
  const restored = await readCache(cachePath);

  assert.equal(restored.assets[filePath]?.hash, cache.assets[filePath]?.hash);
});

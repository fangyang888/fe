import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  resolveCacheRoot,
  resolveIndexPath,
  resolveTransformersCachePath,
} from "../src/config.js";

test("uses a stable user cache directory on macOS", () => {
  assert.equal(
    resolveCacheRoot(undefined, {}, "darwin", "/Users/example"),
    path.join(
      "/Users/example",
      "Library",
      "Caches",
      "internal-component-search-mcp",
    ),
  );
});

test("honors XDG_CACHE_HOME before the platform default", () => {
  assert.equal(
    resolveCacheRoot(
      undefined,
      { XDG_CACHE_HOME: "/var/cache/example" },
      "linux",
      "/home/example",
    ),
    path.join("/var/cache/example", "internal-component-search-mcp"),
  );
});

test("keeps model and project indexes outside the installed npm package", () => {
  const cacheRoot = resolveCacheRoot();
  const modelCache = resolveTransformersCachePath();
  const firstIndex = resolveIndexPath(undefined, "/workspace/first");
  const secondIndex = resolveIndexPath(undefined, "/workspace/second");

  assert.equal(modelCache, path.join(cacheRoot, "models"));
  assert.equal(path.dirname(firstIndex), path.join(cacheRoot, "indexes"));
  assert.notEqual(firstIndex, secondIndex);
});

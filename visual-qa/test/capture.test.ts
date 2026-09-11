import assert from "node:assert/strict";
import { test } from "node:test";
import os from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright";
import {
  captureH5Screenshot,
  isIgnorableFavicon404,
} from "../src/capture.js";

test("ignores only favicon 404 console errors", () => {
  const notFound = "Failed to load resource: the server responded with a status of 404 (Not Found)";
  assert.equal(
    isIgnorableFavicon404(notFound, "http://127.0.0.1:1234/favicon.ico"),
    true,
  );
  assert.equal(
    isIgnorableFavicon404(notFound, "http://127.0.0.1:1234/assets/favicon.png?v=2"),
    true,
  );
  assert.equal(
    isIgnorableFavicon404(notFound, "http://127.0.0.1:1234/app.js"),
    false,
  );
  assert.equal(
    isIgnorableFavicon404("Failed with status 500", "http://127.0.0.1/favicon.ico"),
    false,
  );
  assert.equal(isIgnorableFavicon404(notFound, ""), false);
});

test("reuses a caller-owned browser and closes only its context", async () => {
  let evaluation = 0;
  let contextClosed = false;
  let browserClosed = false;
  const page = {
    on: () => page,
    goto: async () => undefined,
    addStyleTag: async () => undefined,
    evaluate: async () => {
      evaluation += 1;
      if (evaluation === 1) return true;
      if (evaluation === 2) return { total: 0, failed: [] };
      return true;
    },
    screenshot: async () => undefined,
    title: async () => "fixture",
    url: () => "http://127.0.0.1/fixture",
  } as unknown as Page;
  const browser = {
    newContext: async () => ({
      newPage: async () => page,
      close: async () => {
        contextClosed = true;
      },
    }),
    close: async () => {
      browserClosed = true;
    },
  } as unknown as Browser;

  const result = await captureH5Screenshot(
    {
      name: "shared-browser",
      designImage: "unused.png",
      url: "http://127.0.0.1/fixture",
      viewport: { width: 375, height: 812 },
      wait: { networkIdle: false, timeoutMs: 200, stableFrames: 1 },
      browserChannel: "chrome",
      cssRules: undefined,
      structure: undefined,
    },
    path.join(os.tmpdir(), "shared-browser.png"),
    { browser },
  );

  assert.equal(result.timings.browserMode, "shared");
  assert.equal(contextClosed, true);
  assert.equal(browserClosed, false);
});

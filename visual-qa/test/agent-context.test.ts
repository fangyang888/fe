import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAgentContext } from "../src/agent-context.js";

test("creates and reuses a compact agent context by content fingerprint", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agent-context-"));
  const casePath = path.join(directory, "case.json");
  const designPath = path.join(directory, "design.png");
  const outputPath = path.join(directory, "agent-context.json");
  await fs.writeFile(designPath, "design-v1");
  await fs.writeFile(
    casePath,
    JSON.stringify({
      name: "member-card",
      pixsoNodeId: "138:97029",
      pixsoNodeVersion: "v1",
      designImage: "./design.png",
      url: "http://127.0.0.1:3000/test2",
      viewport: { width: 375, height: 812 },
    }),
  );

  const created = await writeAgentContext({ casePath, outputPath });
  const cached = await writeAgentContext({ casePath, outputPath });
  const context = JSON.parse(await fs.readFile(outputPath, "utf8")) as {
    source: { nodeId: string; designHash: string };
    viewport: { width: number; height: number };
  };

  assert.equal(created.status, "created");
  assert.equal(cached.status, "cached");
  assert.equal(cached.cacheKey, created.cacheKey);
  assert.equal(context.source.nodeId, "138:97029");
  assert.ok(context.source.designHash);
  assert.deepEqual(context.viewport, {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
  });
});

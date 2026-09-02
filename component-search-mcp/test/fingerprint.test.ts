import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import path from "node:path";
import { createSourceSnapshot } from "../src/scanner.js";

test("changes the source fingerprint after modification and deletion", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "component-search-fingerprint-"),
  );
  const sourceRoot = path.join(projectRoot, "src");
  const componentPath = path.join(sourceRoot, "ChangingCard.tsx");
  await mkdir(sourceRoot, { recursive: true });

  try {
    await writeFile(
      componentPath,
      "export function ChangingCard() { return <div />; }\n",
      "utf8",
    );
    const original = await createSourceSnapshot({ projectRoot });

    await writeFile(
      componentPath,
      "export function ChangingCard() { return <section>changed</section>; }\n",
      "utf8",
    );
    const modified = await createSourceSnapshot({ projectRoot });
    assert.notEqual(modified.fingerprint, original.fingerprint);

    await rm(componentPath);
    const deleted = await createSourceSnapshot({ projectRoot });
    assert.notEqual(deleted.fingerprint, modified.fingerprint);
    assert.equal(deleted.files.length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

#!/usr/bin/env node
const major = Number(String(process.versions.node || '0').split('.')[0]);
if (!Number.isFinite(major) || major < 18) {
  console.error(
    `[wv-agent] CLI & Hub require Node.js >= 18.0.0 (current: v${process.versions.node}).\n` +
      `Note: the Connect/Express middleware ("wv-agent" / "wv-agent/middleware") supports Node.js >= 14.0.0.`
  );
  process.exit(1);
}

import('../src/cli.mjs')
  .then(({ main }) => main(process.argv.slice(2)))
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) }, null, 2));
    process.exit(1);
  });

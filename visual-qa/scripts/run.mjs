#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../dist/src/cli.js', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('Visual QA requires Node.js 18 or later.');
  process.exit(2);
}
if (!existsSync(cli) || !existsSync(new URL('../node_modules/playwright/package.json', import.meta.url))) {
  console.error(`Visual QA is not initialized. In the plugin directory ${root}, run npm ci and npm run build, then retry.`);
  process.exit(2);
}
// Preserve the caller's cwd so project-relative cases and output paths stay in the project.
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 2);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const PKG_JSON = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));

test('package.json is configured for public npmjs.org publishing and Node 14+ installation', () => {
  assert.equal(PKG_JSON.name, 'wv-agent');
  assert.equal(PKG_JSON.license, 'MIT');
  assert.equal(PKG_JSON.publishConfig?.access, 'public');
  assert.equal(PKG_JSON.publishConfig?.registry, 'https://registry.npmjs.org/');
  assert.equal(PKG_JSON.engines?.node, '>=14.0.0');
  assert.equal(PKG_JSON.main, './src/middleware.cjs');
  assert.equal(PKG_JSON.module, './src/middleware.mjs');
  assert.equal(PKG_JSON.types, './types/index.d.ts');
  assert.ok(PKG_JSON.files.includes('types/'));
  assert.ok(PKG_JSON.files.includes('LICENSE'));
  assert.ok(fs.existsSync(path.join(PKG_ROOT, 'LICENSE')));

  // Every declared file target in exports / main / module / types / bin must exist
  const toCheck = [
    PKG_JSON.main,
    PKG_JSON.module,
    PKG_JSON.types,
    ...Object.values(PKG_JSON.bin || {}),
  ];
  function collectExportPaths(val) {
    if (typeof val === 'string') {
      toCheck.push(val);
    } else if (val && typeof val === 'object') {
      for (const child of Object.values(val)) collectExportPaths(child);
    }
  }
  collectExportPaths(PKG_JSON.exports);
  for (const rel of toCheck) {
    assert.ok(fs.existsSync(path.join(PKG_ROOT, rel)), `Missing exported file: ${rel}`);
  }
});

test('Published docs contain no hardcoded local machine paths', () => {
  const readme = fs.readFileSync(path.join(PKG_ROOT, 'README.md'), 'utf8');
  const skill = fs.readFileSync(path.join(PKG_ROOT, 'SKILL.md'), 'utf8');
  assert.ok(!readme.includes('/Users/'), 'README.md must not leak /Users/ paths');
  assert.ok(!skill.includes('/Users/'), 'SKILL.md must not leak /Users/ paths');
});

test('Node 14 middleware/bundler files avoid node: specifier prefix and bin launcher guards Node < 18 before ESM imports', () => {
  for (const rel of [
    'src/middleware.cjs',
    'src/koa.cjs',
    'src/vite.cjs',
    'src/webpack.cjs',
    'src/bridge-instrument.cjs',
    'src/bridge-loader.cjs',
  ]) {
    const src = fs.readFileSync(path.join(PKG_ROOT, rel), 'utf8');
    assert.ok(!/require\(['"]node:/.test(src), `${rel} must not use node: require specifier (breaks Node 14.0-14.17)`);
  }

  const binSrc = fs.readFileSync(path.join(PKG_ROOT, 'bin/wv-agent.mjs'), 'utf8');
  assert.ok(binSrc.startsWith('#!/usr/bin/env node\n'), 'bin/wv-agent.mjs must start with node shebang');
  assert.ok(!/^\s*import\s+/m.test(binSrc), 'bin/wv-agent.mjs must not have static imports before Node >= 18 version check');
  assert.ok(!/\bawait\b/.test(binSrc), 'bin/wv-agent.mjs must avoid top-level await for Node 14.0-14.7 compatibility');
});

test('CLI supports --version, -v, and version --json', async () => {
  const cliPath = path.join(PKG_ROOT, 'bin/wv-agent.mjs');

  const { stdout: v1 } = await execFileAsync(process.execPath, [cliPath, '--version']);
  assert.equal(v1.trim(), PKG_JSON.version);

  const { stdout: v2 } = await execFileAsync(process.execPath, [cliPath, '-v']);
  assert.equal(v2.trim(), PKG_JSON.version);

  const { stdout: vJson } = await execFileAsync(process.execPath, [cliPath, '--version', '--json']);
  const parsed = JSON.parse(vJson);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.name, PKG_JSON.name);
  assert.equal(parsed.version, PKG_JSON.version);
});

test('npm pack tarball works as a real installed package for ESM, CommonJS, and CLI', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-agent-pack-test-'));
  const tarballDir = path.join(tmpDir, 'pack');
  const consumerDir = path.join(tmpDir, 'consumer');
  const installedPkgDir = path.join(consumerDir, 'node_modules', 'wv-agent');
  fs.mkdirSync(tarballDir, { recursive: true });
  fs.mkdirSync(installedPkgDir, { recursive: true });

  try {
    // 1. Pack tarball using npm pack
    const { stdout: packOut } = await execFileAsync(
      'npm',
      ['pack', '--pack-destination', tarballDir],
      { cwd: PKG_ROOT, timeout: 20000 }
    );
    const tgzName = packOut.trim().split(/\r?\n/).pop().trim();
    const tgzPath = path.join(tarballDir, tgzName);
    assert.ok(fs.existsSync(tgzPath), `Tarball not created: ${tgzPath}`);

    // 2. Extract packed tarball into consumer/node_modules/wv-agent
    await execFileAsync('tar', ['-xzf', tgzPath, '-C', installedPkgDir, '--strip-components=1'], {
      timeout: 15000,
    });

    // Verify no tests/ or dist/ leaked into tarball
    assert.ok(!fs.existsSync(path.join(installedPkgDir, 'tests')), 'tests/ must not be published');
    assert.ok(!fs.existsSync(path.join(installedPkgDir, 'dist')), 'dist/ must not be published');
    assert.ok(fs.existsSync(path.join(installedPkgDir, 'types/index.d.ts')));
    assert.ok(fs.existsSync(path.join(installedPkgDir, 'types/middleware.d.mts')));
    assert.ok(fs.existsSync(path.join(installedPkgDir, 'types/middleware.d.cts')));

    // 3. Test CommonJS consumer (Node 14+ style)
    const cjsScript = path.join(consumerDir, 'check.cjs');
    fs.writeFileSync(
      cjsScript,
      `
      const assert = require('assert');
      const createMwDefault = require('wv-agent');
      const { createWvAgentMiddleware, createWvAgentKoaMiddleware, wvAgentVitePlugin, wvAgentWebpackPlugin } = require('wv-agent');
      const mwSubpath = require('wv-agent/middleware');
      const koaDefault = require('wv-agent/koa');
      const { createWvAgentKoaMiddleware: koaNamed } = require('wv-agent/koa');
      const viteDefault = require('wv-agent/vite');
      const { wvAgentVitePlugin: viteNamed } = require('wv-agent/vite');
      const webpackDefault = require('wv-agent/webpack');
      const { wvAgentWebpackPlugin: webpackNamed } = require('wv-agent/webpack');
      const clientPath = require.resolve('wv-agent/client');
      const pkg = require('wv-agent/package.json');

      assert.strictEqual(typeof createMwDefault, 'function');
      assert.strictEqual(createMwDefault, createWvAgentMiddleware);
      assert.strictEqual(createMwDefault, mwSubpath);
      assert.strictEqual(typeof createWvAgentKoaMiddleware, 'function');
      assert.strictEqual(koaDefault, createWvAgentKoaMiddleware);
      assert.strictEqual(koaNamed, createWvAgentKoaMiddleware);
      assert.strictEqual(typeof createWvAgentKoaMiddleware(), 'function');
      assert.strictEqual(typeof wvAgentVitePlugin, 'function');
      assert.strictEqual(viteDefault, wvAgentVitePlugin);
      assert.strictEqual(viteNamed, wvAgentVitePlugin);
      assert.strictEqual(typeof wvAgentWebpackPlugin, 'function');
      assert.strictEqual(webpackDefault, wvAgentWebpackPlugin);
      assert.strictEqual(webpackNamed, wvAgentWebpackPlugin);
      assert.strictEqual(wvAgentWebpackPlugin().name, 'wv-agent-webpack-plugin');
      assert.strictEqual(typeof createMwDefault(), 'function');
      assert.strictEqual(wvAgentVitePlugin().name, 'wv-agent-dev-middleware');
      assert.strictEqual(wvAgentVitePlugin().apply, 'serve');
      assert.ok(clientPath.endsWith('client.js'));
      assert.strictEqual(pkg.name, 'wv-agent');
      console.log('CJS_OK');
      `,
      'utf8'
    );
    const { stdout: cjsOut } = await execFileAsync(process.execPath, [cjsScript], { cwd: consumerDir });
    assert.equal(cjsOut.trim(), 'CJS_OK');

    // 4. Test ESM consumer (Vite 5 / Node 18+ style)
    const esmScript = path.join(consumerDir, 'check.mjs');
    fs.writeFileSync(
      esmScript,
      `
      import assert from 'node:assert/strict';
      import createMwDefault, { createWvAgentMiddleware, createWvAgentKoaMiddleware, wvAgentVitePlugin, wvAgentWebpackPlugin } from 'wv-agent';
      import mwSubpath, { wvAgentVitePlugin as mwVite } from 'wv-agent/middleware';
      import koaDefault, { createWvAgentKoaMiddleware as koaNamed } from 'wv-agent/koa';
      import viteDefault, { wvAgentVitePlugin as viteNamed } from 'wv-agent/vite';
      import webpackDefault, { wvAgentWebpackPlugin as webpackNamed } from 'wv-agent/webpack';
      import { WvAgentHub, DEFAULT_HUB_PORT } from 'wv-agent/hub';
      import { diffBridgeResults } from 'wv-agent/diff';
      import { getPluginStatus } from 'wv-agent/plugin';

      assert.equal(typeof createMwDefault, 'function');
      assert.equal(createMwDefault, createWvAgentMiddleware);
      assert.equal(createMwDefault, mwSubpath);
      assert.equal(typeof createWvAgentKoaMiddleware, 'function');
      assert.equal(koaDefault, createWvAgentKoaMiddleware);
      assert.equal(koaNamed, createWvAgentKoaMiddleware);
      assert.equal(typeof wvAgentVitePlugin, 'function');
      assert.equal(mwVite, wvAgentVitePlugin);
      assert.equal(viteDefault, wvAgentVitePlugin);
      assert.equal(viteNamed, wvAgentVitePlugin);
      assert.equal(typeof wvAgentWebpackPlugin, 'function');
      assert.equal(webpackDefault, wvAgentWebpackPlugin);
      assert.equal(webpackNamed, wvAgentWebpackPlugin);
      assert.equal(typeof createMwDefault(), 'function');
      assert.equal(wvAgentVitePlugin().apply, 'serve');
      assert.equal(wvAgentWebpackPlugin().name, 'wv-agent-webpack-plugin');
      assert.equal(typeof WvAgentHub, 'function');
      assert.equal(typeof DEFAULT_HUB_PORT, 'number');
      assert.equal(typeof diffBridgeResults, 'function');
      assert.equal(typeof getPluginStatus, 'function');
      console.log('ESM_OK');
      `,
      'utf8'
    );
    const { stdout: esmOut } = await execFileAsync(process.execPath, [esmScript], { cwd: consumerDir });
    assert.equal(esmOut.trim(), 'ESM_OK');

    // 5. Test packaged CLI entrypoint
    const packedBin = path.join(installedPkgDir, 'bin', 'wv-agent.mjs');
    const { stdout: cliVer } = await execFileAsync(process.execPath, [packedBin, '--version']);
    assert.equal(cliVer.trim(), PKG_JSON.version);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

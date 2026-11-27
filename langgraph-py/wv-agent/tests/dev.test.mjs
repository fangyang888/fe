import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { WvAgentHub } from '../src/hub.mjs';
import { parseDevArgs } from '../src/dev.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../bin/wv-agent.mjs');

test('parseDevArgs handles defaults, -- separator, child flags, --no-env, and validation', () => {
  const def = parseDevArgs([]);
  assert.deepEqual(def.commandArgs, ['npm', 'run', 'dev']);
  assert.equal(def.injectEnv, true);
  assert.equal(def.help, false);

  const withSep = parseDevArgs(['--port', '19528', '--', 'yarn', 'dev', 'curve', '--port', '7600']);
  assert.equal(withSep.port, 19528);
  assert.deepEqual(withSep.commandArgs, ['yarn', 'dev', 'curve', '--port', '7600']);

  const withoutSep = parseDevArgs(['-p', '19529', '--no-env', 'vite', '--port', '5173', '--help']);
  assert.equal(withoutSep.port, 19529);
  assert.equal(withoutSep.injectEnv, false);
  assert.equal(withoutSep.help, false);
  assert.deepEqual(withoutSep.commandArgs, ['vite', '--port', '5173', '--help']);

  const helpOnly = parseDevArgs(['--help']);
  assert.equal(helpOnly.help, true);

  assert.throws(() => parseDevArgs(['--port', 'not-a-number']), /Invalid Hub port/);
});

test('wv-agent dev starts Hub, injects WV_AGENT=1 & WV_AGENT_PORT, and shuts down cleanly', async () => {
  const probeScript = `
    (async () => {
      const port = process.env.WV_AGENT_PORT;
      const resp = await fetch('http://127.0.0.1:' + port + '/health');
      const data = await resp.json();
      console.log(JSON.stringify({ wvAgent: process.env.WV_AGENT, healthOk: data.ok, port: data.port }));
    })().catch((e) => { console.error(e); process.exit(1); });
  `;

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [CLI_PATH, 'dev', '--port', '0', '--', process.execPath, '-e', probeScript],
    { timeout: 15000 }
  );

  const result = JSON.parse(stdout.trim());
  assert.equal(result.wvAgent, '1');
  assert.equal(result.healthOk, true);
  assert.ok(result.port > 0);
  assert.ok(stderr.includes('[wv-agent dev] hub started on port'));

  // Verify the in-process hub was stopped after child exited
  await assert.rejects(() => fetch(`http://127.0.0.1:${result.port}/health`));
});

test('wv-agent dev reuses an already-running Hub without killing it on exit', async () => {
  const existingHub = new WvAgentHub({ port: 0, host: '127.0.0.1' });
  const { port } = await existingHub.start();

  try {
    const probeScript = `
      console.log(JSON.stringify({ wvAgent: process.env.WV_AGENT, port: process.env.WV_AGENT_PORT }));
    `;
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'dev', '--port', String(port), '--no-env', '--', process.execPath, '-e', probeScript],
      {
        timeout: 15000,
        env: { ...process.env, WV_AGENT: '' },
      }
    );

    const result = JSON.parse(stdout.trim());
    assert.equal(result.wvAgent, '');
    assert.equal(result.port, String(port));
    assert.ok(stderr.includes('reusing running hub'));

    // Pre-existing Hub must still be alive after dev child exits
    const healthResp = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthResp.ok, true);
  } finally {
    await existingHub.stop();
  }
});

test('wv-agent dev propagates non-zero child exit code and supports --help', async () => {
  const { stdout: helpOut } = await execFileAsync(process.execPath, [CLI_PATH, 'dev', '--help'], {
    timeout: 10000,
  });
  assert.ok(helpOut.includes('wv-agent dev'));

  let caught = null;
  try {
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'dev', '--port', '0', '--', process.execPath, '-e', 'process.exit(42)'],
      { timeout: 15000 }
    );
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'Expected non-zero exit');
  assert.equal(caught.code, 42);
});

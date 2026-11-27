import path from 'node:path';
import { spawn } from 'node:child_process';
import { WvAgentHub, DEFAULT_HUB_PORT } from './hub.mjs';

export function parseDevArgs(rawArgs = []) {
  const args = Array.isArray(rawArgs) ? rawArgs : [];
  let port = Number(process.env.WV_AGENT_PORT || DEFAULT_HUB_PORT);
  let host = '0.0.0.0';
  let injectEnv = true;
  let help = false;
  let commandArgs = [];

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--') {
      commandArgs = args.slice(i + 1);
      break;
    }
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--no-env') {
      injectEnv = false;
      continue;
    }
    if (token === '--port' || token === '-p') {
      const next = args[i + 1];
      if (next === undefined) throw new Error(`${token} requires a port number`);
      port = Number(next);
      i++;
      continue;
    }
    if (token.startsWith('--port=')) {
      port = Number(token.slice('--port='.length));
      continue;
    }
    if (token === '--host') {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--host requires a hostname');
      host = String(next);
      i++;
      continue;
    }
    if (token.startsWith('--host=')) {
      host = token.slice('--host='.length);
      continue;
    }
    // First non-flag token starts the child dev command verbatim
    commandArgs = args.slice(i);
    break;
  }

  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid Hub port: ${port}`);
  }

  if (commandArgs.length === 0) {
    commandArgs = ['npm', 'run', 'dev'];
  }

  return { port, host, injectEnv, help, commandArgs };
}

export function printDevHelp() {
  console.log(`wv-agent dev — 一键同时启动本机 Hub 与前端 dev 服务（支持跨平台、自动复用已运行 Hub）

Usage:
  wv-agent dev [--port 19527] [--host 0.0.0.0] [--no-env] [-- <command...>]

Examples:
  # 默认启动 Hub 并执行 npm run dev（自动注入 WV_AGENT=1）
  wv-agent dev

  # 在 package.json 中配置：
  #   "dev:wv": "wv-agent dev -- npm run dev"
  #   "dev:wv": "wv-agent dev -- yarn dev"         # 支持透传参数：yarn dev:wv curve
  #   "dev:wv": "wv-agent dev -- vite --host"

Options:
  -p, --port <port>   指定 Hub 端口（默认读取 WV_AGENT_PORT 或 19527）
  --host <host>       指定 Hub 监听地址（默认 0.0.0.0）
  --no-env            不自动注入 WV_AGENT=1
  -h, --help          显示此帮助信息
`);
}

async function checkExistingHub(port) {
  if (port === 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.ok === true && Number(data.port) === Number(port)) {
      return data;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function appendLocalBinToPath(env) {
  const localBin = path.join(process.cwd(), 'node_modules', '.bin');
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const current = env[pathKey] || '';
  const parts = current ? current.split(path.delimiter) : [];
  if (!parts.includes(localBin)) {
    env[pathKey] = current ? `${current}${path.delimiter}${localBin}` : localBin;
  }
  return env;
}

export async function runDevCommand(rawArgs = []) {
  const opts = parseDevArgs(rawArgs);
  if (opts.help) {
    printDevHelp();
    return 0;
  }

  let hub = null;
  let actualPort = opts.port;
  const existing = await checkExistingHub(opts.port);

  if (existing) {
    console.error(
      `[wv-agent dev] reusing running hub on http://127.0.0.1:${actualPort} (observer: http://127.0.0.1:${actualPort}/observe)`
    );
  } else {
    hub = new WvAgentHub({ port: opts.port, host: opts.host });
    try {
      const info = await hub.start();
      actualPort = info.port;
      console.error(
        `[wv-agent dev] hub started on port ${actualPort} (observer: http://127.0.0.1:${actualPort}/observe)`
      );
    } catch (err) {
      hub = null;
      if (err && err.code === 'EADDRINUSE') {
        const raced = await checkExistingHub(opts.port);
        if (raced) {
          console.error(
            `[wv-agent dev] reusing running hub on http://127.0.0.1:${actualPort} (observer: http://127.0.0.1:${actualPort}/observe)`
          );
        } else {
          throw new Error(
            `Port ${opts.port} is already in use by another process. Pass --port <port> or set WV_AGENT_PORT.`
          );
        }
      } else {
        throw err;
      }
    }
  }

  const childEnv = appendLocalBinToPath({
    ...process.env,
    WV_AGENT_PORT: String(actualPort),
    ...(opts.injectEnv ? { WV_AGENT: '1' } : {}),
  });
  delete childEnv.WV_AGENT_REEXEC;

  const isWin = process.platform === 'win32';
  const useShellString = opts.commandArgs.length === 1 && /\s/.test(opts.commandArgs[0]);
  const cmdDisplay = opts.commandArgs.join(' ');
  console.error(
    `[wv-agent dev] launching: ${cmdDisplay}${opts.injectEnv ? ' (WV_AGENT=1)' : ''}`
  );

  const child = useShellString
    ? spawn(opts.commandArgs[0], [], { stdio: 'inherit', env: childEnv, shell: true })
    : spawn(opts.commandArgs[0], opts.commandArgs.slice(1), {
        stdio: 'inherit',
        env: childEnv,
        shell: isWin,
      });

  let stopping = false;
  async function stopHub() {
    if (!hub) return;
    const target = hub;
    hub = null;
    try {
      await target.stop();
    } catch {
      // ignore
    }
  }

  function forwardSignal(sig) {
    if (stopping) return;
    stopping = true;
    if (child && !child.killed && child.exitCode === null) {
      try {
        child.kill(sig);
      } catch {
        // ignore
      }
    }
  }

  const onSigInt = () => forwardSignal('SIGINT');
  const onSigTerm = () => forwardSignal('SIGTERM');
  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', (err) => {
        reject(new Error(`Failed to launch "${cmdDisplay}": ${err.message}`));
      });
      child.once('exit', (code, signal) => {
        if (typeof code === 'number') resolve(code);
        else if (signal === 'SIGINT') resolve(130);
        else if (signal === 'SIGTERM') resolve(143);
        else resolve(1);
      });
    });
    return exitCode;
  } finally {
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    await stopHub();
  }
}

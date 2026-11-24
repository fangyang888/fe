#!/usr/bin/env node
import { WvAgentHub, DEFAULT_HUB_PORT } from '../src/hub.mjs';
import {
  listNativeDevices,
  takeNativeScreenshot,
  fetchNativeLogs,
  forwardWebViewCdp,
} from '../src/native.mjs';
import {
  buildPlugins,
  installPlugins,
  uninstallPlugins,
  getPluginStatus,
} from '../src/plugin.mjs';

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (token.startsWith('-') && token.length === 2) {
      const shortMap = { d: 'device', p: 'port', o: 'out', t: 'timeout', s: 'serial' };
      const key = shortMap[token[1]] || token[1];
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

function getHubBase(flags) {
  const port = Number(flags.port || process.env.WV_AGENT_PORT || DEFAULT_HUB_PORT);
  const host = flags.host || '127.0.0.1';
  return `http://${host}:${port}`;
}

async function hubFetch(baseUrl, pathname, opts = {}) {
  let resp;
  try {
    resp = await fetch(`${baseUrl}${pathname}`, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    throw new Error(`无法连接 wv-agent hub (${baseUrl})，请先在另一个终端启动: wv-agent hub (${err.message})`);
  }
  const data = await resp.json();
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `Hub HTTP ${resp.status}`);
  }
  return data;
}

function parseJsonArg(str, fallback = {}) {
  if (str === undefined || str === null || str === '') return fallback;
  try {
    return JSON.parse(str);
  } catch (err) {
    throw new Error(`Invalid JSON argument "${str}": ${err.message}`);
  }
}

function printOutput(data, asJson) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function printHelp() {
  console.log(`wv-agent — WebView 自测 & MeiYouJSBridge 三端联调 CLI (Android / iOS / HarmonyOS)

Usage:
  wv-agent hub [--port 19527]
      启动本机 WebSocket + HTTP 调试中心（手机扫码打开带探针的页面后自动连入）

  wv-agent devices [--json] [--port 19527]
      列出在线的 WebView 会话（Android / iOS / 鸿蒙）以及本机连接的 USB/模拟器设备

  wv-agent snapshot [-d <deviceId|android|ios|harmony>] [--max 120] [--json]
      获取当前 WebView 页面精简可交互 DOM 快照（带元素编号 e1, e2...）

  wv-agent act <click|fill|scroll|reload|back> [refOrValue] [-d <device>] [--selector <css>] [--text <txt>] [--value <v>] [--dy <px>] [--json]
      在真机 WebView 中执行交互操作

  wv-agent eval "<js_expression>" [-d <device>] [--json]
      在真机 WebView 中执行 JS 表达式并返回结果

  wv-agent bridge call <path> ['<paramsJson>'] [-d <device>] [--timeout 8000] [--json]
      直接调用 window.MeiYouJSBridge.invoke(path, params, cb)，返回结构化回包/耗时/超时状态

  wv-agent bridge diff <path> ['<paramsJson>'] [--devices android,ios,harmony] [--timeout 8000] [--json]
      在多个在线端同时执行同一 JSBridge 协议，自动输出字段缺失与类型差异

  wv-agent bridge trace [-d <device>] [--limit 50] [--json]
      查看页面业务交互触发的所有 MeiYouJSBridge.invoke / on 报文记录

  wv-agent bridge export-debug --target <http://localhost:1234/__bridge-debug__> [-d <device>] [--json]
      将真机录到的 JSBridge Trace 同步写入项目已有的 meetyou.bridge-debug 服务，供 PC 浏览器回放

  wv-agent inspect [-d <device>] [--limit 50] [--json]
      拉取页面 Console 报错、未捕获异常、失败的网络请求

  wv-agent screenshot --os <android|harmony|ios> [-s <serial>] [-o <file.png>] [--json]
      截取真机屏幕（含原生导航栏、安全区、系统弹窗）

  wv-agent logs --os <android|harmony> [-s <serial>] [--grep MeiYouJSBridge] [--lines 120] [--json]
      拉取 Android(logcat) 或 鸿蒙(hilog) 原生侧日志用于双端对账

  wv-agent cdp --os <android|harmony> [-s <serial>] [--cdp-port 9222] [--pid <pid>] [--json]
      自动查找 webview_devtools_remote socket 并端口转发到本地（白屏/探针未启动时兜底）

  wv-agent clear [-d <device>] [--json]
      清空 Hub 缓存的 traces / errors / consoles / network 记录

  wv-agent plugin build [--target all|antigravity|codex] [--out ./dist/plugins] [--pkg <npmPkg>] [--name wv-agent] [--json]
      打包生成 Antigravity 插件与 Codex 技能包（仅含清单与 SKILL.md，不含源码）

  wv-agent plugin install [--target all|antigravity|codex] [--pkg <npmPkg>] [--name wv-agent] [--json]
      一键安装到本机 Antigravity (~/.gemini/config/plugins) 和 Codex (~/.codex/skills)

  wv-agent plugin status [--name wv-agent] [--json]
      查看本机 Antigravity 与 Codex 插件安装状态

  wv-agent plugin uninstall [--target all|antigravity|codex] [--name wv-agent] [--json]
      卸载本机 Antigravity / Codex 中的 wv-agent 插件
`);
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const cmd = positionals[0];
  const asJson = Boolean(flags.json);

  if (!cmd || cmd === 'help' || flags.help || flags.h) {
    printHelp();
    return;
  }

  if (cmd === 'hub') {
    const port = Number(flags.port || process.env.WV_AGENT_PORT || DEFAULT_HUB_PORT);
    const hub = new WvAgentHub({ port });
    const info = await hub.start();
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: 'wv-agent hub started',
          port: info.port,
          lanIps: info.lanIps,
          clientScriptUrl: `http://127.0.0.1:${info.port}/client.js`,
          wsUrls: info.lanIps.map((ip) => `ws://${ip}:${info.port}/ws`),
        },
        null,
        2
      )
    );
    process.on('SIGINT', async () => {
      await hub.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await hub.stop();
      process.exit(0);
    });
    return;
  }

  if (cmd === 'plugin') {
    const sub = positionals[1];
    if (sub === 'build') {
      const res = buildPlugins({
        outDir: flags.out,
        target: flags.target || 'all',
        pluginName: flags.name,
        pkgName: flags.pkg,
        binName: flags.bin || 'wv-agent',
        mcpUrl: flags['mcp-url'],
        apiKey: flags['api-key'],
      });
      printOutput(res, asJson);
      return;
    }
    if (sub === 'install') {
      const res = installPlugins({
        target: flags.target || 'all',
        pluginName: flags.name,
        pkgName: flags.pkg,
        binName: flags.bin || 'wv-agent',
        mcpUrl: flags['mcp-url'],
        apiKey: flags['api-key'],
        antigravityRoot: flags['antigravity-dir'],
        codexRoot: flags['codex-dir'],
      });
      printOutput(res, asJson);
      return;
    }
    if (sub === 'uninstall') {
      const res = uninstallPlugins({
        target: flags.target || 'all',
        pluginName: flags.name || 'wv-agent',
        antigravityRoot: flags['antigravity-dir'],
        codexRoot: flags['codex-dir'],
      });
      printOutput(res, asJson);
      return;
    }
    if (sub === 'status') {
      const res = getPluginStatus({
        pluginName: flags.name || 'wv-agent',
        antigravityRoot: flags['antigravity-dir'],
        codexRoot: flags['codex-dir'],
      });
      printOutput(res, asJson);
      return;
    }
    throw new Error(`Unknown plugin subcommand: ${sub}. Use build | install | status | uninstall.`);
  }

  const baseUrl = getHubBase(flags);

  if (cmd === 'devices') {
    let hubData = { online: false, devices: [] };
    try {
      const res = await hubFetch(baseUrl, '/api/devices');
      hubData = { online: true, devices: res.devices };
    } catch (err) {
      hubData = { online: false, error: err.message, devices: [] };
    }
    const native = await listNativeDevices();
    printOutput({ ok: true, hub: hubData, native }, asJson);
    return;
  }

  if (cmd === 'snapshot') {
    const res = await hubFetch(baseUrl, '/api/rpc', {
      method: 'POST',
      body: {
        device: flags.device,
        cmd: 'snapshot',
        payload: { maxElements: Number(flags.max || 120) },
      },
    });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'act') {
    const action = positionals[1];
    const targetArg = positionals[2];
    const valueArg = positionals[3];
    if (!action) throw new Error('act requires an action: click | fill | scroll | reload | back');
    const payload = {
      action,
      ref: targetArg && /^e\d+$/.test(targetArg) ? targetArg : flags.ref,
      selector: flags.selector || (targetArg && !/^e\d+$/.test(targetArg) && action !== 'scroll' ? targetArg : undefined),
      text: flags.text,
      value: flags.value !== undefined ? flags.value : valueArg,
      dy: flags.dy !== undefined ? Number(flags.dy) : (action === 'scroll' && targetArg ? Number(targetArg) : undefined),
      dx: flags.dx !== undefined ? Number(flags.dx) : undefined,
    };
    const res = await hubFetch(baseUrl, '/api/rpc', {
      method: 'POST',
      body: { device: flags.device, cmd: 'act', payload },
    });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'eval') {
    const expression = positionals[1];
    if (!expression) throw new Error('eval requires a JS expression');
    const res = await hubFetch(baseUrl, '/api/rpc', {
      method: 'POST',
      body: { device: flags.device, cmd: 'eval', payload: { expression } },
    });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'bridge') {
    const sub = positionals[1];
    if (sub === 'call') {
      const bridgePath = positionals[2];
      const params = parseJsonArg(positionals[3], {});
      const timeoutMs = Number(flags.timeout || 8000);
      if (!bridgePath) throw new Error('bridge call requires <path>');
      const res = await hubFetch(baseUrl, '/api/rpc', {
        method: 'POST',
        body: {
          device: flags.device,
          cmd: 'bridge.call',
          payload: { path: bridgePath, params, timeoutMs },
          timeoutMs: timeoutMs + 3000,
        },
      });
      printOutput(res, asJson);
      return;
    }

    if (sub === 'diff') {
      const bridgePath = positionals[2];
      const params = parseJsonArg(positionals[3], {});
      const timeoutMs = Number(flags.timeout || 8000);
      const devices = flags.devices ? String(flags.devices).split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      if (!bridgePath) throw new Error('bridge diff requires <path>');
      const res = await hubFetch(baseUrl, '/api/bridge/diff', {
        method: 'POST',
        body: { path: bridgePath, params, timeoutMs, devices },
      });
      printOutput(res, asJson);
      return;
    }

    if (sub === 'trace') {
      const qs = new URLSearchParams();
      if (flags.device) qs.set('device', flags.device);
      if (flags.limit) qs.set('limit', String(flags.limit));
      const res = await hubFetch(baseUrl, `/api/traces?${qs.toString()}`);
      printOutput(res, asJson);
      return;
    }

    if (sub === 'export-debug') {
      const target = String(flags.target || 'http://127.0.0.1:1234/__bridge-debug__').replace(/\/$/, '');
      const qs = new URLSearchParams();
      if (flags.device) qs.set('device', flags.device);
      const res = await hubFetch(baseUrl, `/api/traces?${qs.toString()}`);
      let exported = 0;
      for (const item of res.traces || []) {
        if (item.status !== 'resolved' && item.status !== 'event') continue;
        const kind = item.kind === 'event' ? 'event' : 'invoke';
        await fetch(`${target}/${kind}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: item.path,
            params: item.params || {},
            data: item.data,
            source: `wv-agent:${res.platform}`,
            href: item.url || '',
          }),
        });
        exported++;
      }
      printOutput({ ok: true, target, exported, platform: res.platform, clientId: res.clientId }, asJson);
      return;
    }

    throw new Error(`Unknown bridge subcommand: ${sub}. Use call | diff | trace | export-debug.`);
  }

  if (cmd === 'inspect') {
    const qs = new URLSearchParams();
    if (flags.device) qs.set('device', flags.device);
    if (flags.limit) qs.set('limit', String(flags.limit));
    const res = await hubFetch(baseUrl, `/api/inspect?${qs.toString()}`);
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'clear') {
    const qs = new URLSearchParams();
    if (flags.device) qs.set('device', flags.device);
    const res = await hubFetch(baseUrl, `/api/state?${qs.toString()}`, { method: 'DELETE' });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'screenshot') {
    const osName = String(flags.os || 'android').toLowerCase();
    const res = await takeNativeScreenshot({ osName, serial: flags.serial, outputPath: flags.out });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'logs') {
    const osName = String(flags.os || 'android').toLowerCase();
    const res = await fetchNativeLogs({
      osName,
      serial: flags.serial,
      grep: flags.grep !== undefined ? String(flags.grep) : 'MeiYouJSBridge',
      lines: Number(flags.lines || 120),
    });
    printOutput(res, asJson);
    return;
  }

  if (cmd === 'cdp') {
    const osName = String(flags.os || 'android').toLowerCase();
    const res = await forwardWebViewCdp({
      osName,
      serial: flags.serial,
      localPort: Number(flags['cdp-port'] || (osName === 'harmony' ? 9223 : 9222)),
      pid: flags.pid,
    });
    printOutput(res, asJson);
    return;
  }

  throw new Error(`Unknown command: ${cmd}. Run "wv-agent --help".`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2));
  process.exit(1);
});

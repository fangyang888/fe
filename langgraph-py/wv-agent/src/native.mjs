import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function firstExisting(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export function findAdbBinary() {
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return (
    firstExisting(
      isWin
        ? [
            process.env.ADB_PATH,
            path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
            'C:\\Android\\platform-tools\\adb.exe',
          ]
        : [
            process.env.ADB_PATH,
            path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
            path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
            '/opt/homebrew/bin/adb',
            '/usr/local/bin/adb',
          ]
    ) || (isWin ? 'adb.exe' : 'adb')
  );
}

export function findHdcBinary() {
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return (
    firstExisting(
      isWin
        ? [
            process.env.HDC_PATH,
            'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
            path.join(localAppData, 'Huawei', 'Sdk', 'openharmony', 'toolchains', 'hdc.exe'),
          ]
        : [
            process.env.HDC_PATH,
            '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc',
            path.join(home, 'Library', 'Huawei', 'Sdk', 'openharmony', 'toolchains', 'hdc'),
            '/opt/homebrew/bin/hdc',
            '/usr/local/bin/hdc',
          ]
    ) || (isWin ? 'hdc.exe' : 'hdc')
  );
}

async function runBin(bin, args, opts = {}) {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: opts.timeout || 15000,
    encoding: opts.encoding === 'buffer' ? 'buffer' : 'utf8',
  });
  return { stdout, stderr };
}

export async function listNativeDevices() {
  const result = {
    binaries: {
      adb: findAdbBinary(),
      hdc: findHdcBinary(),
    },
    android: [],
    harmony: [],
    iosSimulators: [],
  };

  // Android via adb
  try {
    const { stdout } = await runBin(result.binaries.adb, ['devices', '-l'], { timeout: 5000 });
    const lines = String(stdout).split(/\r?\n/).slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        result.android.push({
          serial: parts[0],
          state: parts[1],
          info: parts.slice(2).join(' '),
        });
      }
    }
  } catch (err) {
    result.androidError = err.message;
  }

  // HarmonyOS via hdc
  try {
    const { stdout } = await runBin(result.binaries.hdc, ['list', 'targets'], { timeout: 5000 });
    const lines = String(stdout).split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[Empty]') continue;
      result.harmony.push({ serial: trimmed, state: 'device' });
    }
  } catch (err) {
    result.harmonyError = err.message;
  }

  // iOS Booted Simulators via xcrun simctl
  try {
    const { stdout } = await runBin('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { timeout: 5000 });
    const parsed = JSON.parse(String(stdout));
    for (const [runtime, list] of Object.entries(parsed.devices || {})) {
      for (const dev of list || []) {
        if (dev.state === 'Booted') {
          result.iosSimulators.push({ udid: dev.udid, name: dev.name, runtime });
        }
      }
    }
  } catch {
    // xcrun unavailable or no simulators
  }

  return result;
}

export async function takeNativeScreenshot({ osName, serial, outputPath }) {
  const out = path.resolve(outputPath || path.join(os.tmpdir(), `wv-agent-${osName}-${Date.now()}.png`));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (osName === 'android') {
    const adb = findAdbBinary();
    const args = serial ? ['-s', serial, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
    const { stdout } = await runBin(adb, args, { encoding: 'buffer', timeout: 15000 });
    fs.writeFileSync(out, stdout);
    return { ok: true, os: 'android', path: out, bytes: stdout.length };
  }

  if (osName === 'harmony') {
    const hdc = findHdcBinary();
    const remotePath = `/data/local/tmp/wv_agent_${Date.now()}.jpeg`;
    const finalOut = out.endsWith('.png') ? out.replace(/\.png$/, '.jpeg') : out;
    const prefix = serial ? ['-t', serial] : [];
    await runBin(hdc, [...prefix, 'shell', 'snapshot_display', '-f', remotePath], { timeout: 15000 });
    await runBin(hdc, [...prefix, 'file', 'recv', remotePath, finalOut], { timeout: 15000 });
    try {
      await runBin(hdc, [...prefix, 'shell', 'rm', '-f', remotePath], { timeout: 5000 });
    } catch {
      // ignore cleanup error
    }
    const stat = fs.statSync(finalOut);
    return { ok: true, os: 'harmony', path: finalOut, bytes: stat.size };
  }

  if (osName === 'ios') {
    const target = serial || 'booted';
    await runBin('xcrun', ['simctl', 'io', target, 'screenshot', out], { timeout: 15000 });
    const stat = fs.statSync(out);
    return { ok: true, os: 'ios', path: out, bytes: stat.size };
  }

  throw new Error(`Unsupported OS for native screenshot: ${osName}. Use android, harmony, or ios.`);
}

export async function fetchNativeLogs({ osName, serial, grep = 'MeiYouJSBridge', lines = 120 }) {
  if (osName === 'android') {
    const adb = findAdbBinary();
    const args = serial ? ['-s', serial, 'logcat', '-d', '-t', String(Math.max(lines * 4, 400))] : ['logcat', '-d', '-t', String(Math.max(lines * 4, 400))];
    const { stdout } = await runBin(adb, args, { timeout: 15000 });
    const allLines = String(stdout).split(/\r?\n/);
    const filtered = grep
      ? allLines.filter((l) => l.toLowerCase().includes(grep.toLowerCase()))
      : allLines;
    return { ok: true, os: 'android', grep, totalMatched: filtered.length, lines: filtered.slice(-lines) };
  }

  if (osName === 'harmony') {
    const hdc = findHdcBinary();
    const prefix = serial ? ['-t', serial] : [];
    const { stdout } = await runBin(hdc, [...prefix, 'shell', 'hilog', '-x'], { timeout: 15000 });
    const allLines = String(stdout).split(/\r?\n/);
    const filtered = grep
      ? allLines.filter((l) => l.toLowerCase().includes(grep.toLowerCase()))
      : allLines;
    return { ok: true, os: 'harmony', grep, totalMatched: filtered.length, lines: filtered.slice(-lines) };
  }

  throw new Error(`Native log pull currently supports android and harmony (got: ${osName}).`);
}

/**
 * Auto-discover WebView DevTools socket and forward to local TCP port (CDP fallback for white screen / startup errors).
 */
export async function forwardWebViewCdp({ osName, serial, localPort = 9222, pid }) {
  if (osName === 'android') {
    const adb = findAdbBinary();
    const prefix = serial ? ['-s', serial] : [];
    const { stdout } = await runBin(adb, [...prefix, 'shell', 'cat', '/proc/net/unix'], { timeout: 10000 });
    const sockets = [...String(stdout).matchAll(/@(webview_devtools_remote_\d+)/g)].map((m) => m[1]);
    const uniqueSockets = [...new Set(sockets)];
    const targetSocket = pid
      ? `webview_devtools_remote_${pid}`
      : uniqueSockets[uniqueSockets.length - 1];
    if (!targetSocket) {
      throw new Error('No Android webview_devtools_remote socket found. Make sure WebView debugging is enabled and a WebView is open.');
    }
    await runBin(adb, [...prefix, 'forward', `tcp:${localPort}`, `localabstract:${targetSocket}`], { timeout: 10000 });
    return {
      ok: true,
      os: 'android',
      socket: targetSocket,
      allSockets: uniqueSockets,
      cdpUrl: `http://127.0.0.1:${localPort}`,
      targetsUrl: `http://127.0.0.1:${localPort}/json/list`,
    };
  }

  if (osName === 'harmony') {
    const hdc = findHdcBinary();
    const prefix = serial ? ['-t', serial] : [];
    const { stdout } = await runBin(hdc, [...prefix, 'shell', 'cat /proc/net/unix | grep devtools'], { timeout: 10000 });
    const sockets = [...String(stdout).matchAll(/@(webview_devtools_remote_\d+)/g)].map((m) => m[1]);
    const uniqueSockets = [...new Set(sockets)];
    const targetSocket = pid
      ? `webview_devtools_remote_${pid}`
      : uniqueSockets[uniqueSockets.length - 1];
    if (!targetSocket) {
      throw new Error('No HarmonyOS ArkWeb webview_devtools_remote socket found. Make sure setWebDebuggingAccess(true) is enabled.');
    }
    await runBin(hdc, [...prefix, 'fport', `tcp:${localPort}`, `localabstract:${targetSocket}`], { timeout: 10000 });
    return {
      ok: true,
      os: 'harmony',
      socket: targetSocket,
      allSockets: uniqueSockets,
      cdpUrl: `http://127.0.0.1:${localPort}`,
      targetsUrl: `http://127.0.0.1:${localPort}/json/list`,
    };
  }

  throw new Error(`CDP auto-forward supports android and harmony (got: ${osName}).`);
}

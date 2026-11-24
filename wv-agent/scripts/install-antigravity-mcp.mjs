#!/usr/bin/env node
/**
 * 一键向 Antigravity (~/.gemini/antigravity/mcp_config.json) 注入或移除 wv-agent 远程 MCP 配置。
 * 零外部依赖，兼容 macOS / Windows / Linux，可单独拷贝分发（不含任何服务端源码）。
 *
 * 用法：
 *   node install-antigravity-mcp.mjs
 *   node install-antigravity-mcp.mjs --url http://47.106.103.79/wv-agent/mcp
 *   node install-antigravity-mcp.mjs --url http://47.106.103.79/wv-agent/mcp --api-key YOUR_KEY
 *   node install-antigravity-mcp.mjs --remove
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_URL = process.env.WV_AGENT_MCP_URL || 'http://47.106.103.79/wv-agent/mcp';
const DEFAULT_NAME = 'wv-agent-mcp';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const eq = t.indexOf('=');
    if (eq !== -1) {
      flags[t.slice(2, eq)] = t.slice(eq + 1);
    } else {
      const k = t.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i++;
      } else {
        flags[k] = true;
      }
    }
  }
  return flags;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Usage:
  node install-antigravity-mcp.mjs [--url <mcpUrl>] [--name <serverName>] [--api-key <key>] [--config <path>]
  node install-antigravity-mcp.mjs --remove [--name <serverName>] [--config <path>]`);
    return;
  }

  const configPath = path.resolve(
    flags.config || path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json')
  );
  const serverName = String(flags.name || DEFAULT_NAME).trim();
  const serverUrl = String(flags.url || DEFAULT_URL).trim();
  const apiKey = flags['api-key'] ? String(flags['api-key']).trim() : '';
  const isRemove = Boolean(flags.remove || flags.uninstall);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let data = { mcpServers: {} };
  let backupPath = null;
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8').trim();
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        throw new Error(`Failed to parse existing ${configPath}: ${err.message}`);
      }
    }
    backupPath = `${configPath}.bak-${Date.now()}`;
    fs.copyFileSync(configPath, backupPath);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = { mcpServers: {} };
  }
  if (!data.mcpServers || typeof data.mcpServers !== 'object' || Array.isArray(data.mcpServers)) {
    data.mcpServers = {};
  }

  if (isRemove) {
    const existed = Object.prototype.hasOwnProperty.call(data.mcpServers, serverName);
    delete data.mcpServers[serverName];
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(
      JSON.stringify(
        {
          ok: true,
          target: 'antigravity',
          action: 'remove',
          serverName,
          existed,
          configPath,
          backupPath,
        },
        null,
        2
      )
    );
    return;
  }

  const entry = { serverUrl };
  if (apiKey) {
    entry.headers = { Authorization: `Bearer ${apiKey}` };
  }
  data.mcpServers[serverName] = entry;

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        ok: true,
        target: 'antigravity',
        action: 'install',
        serverName,
        entry,
        configPath,
        backupPath,
        tip: '配置已写入 Antigravity mcp_config.json，刷新/重开对话后即可直接调用 wv_* MCP 工具。',
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2));
  process.exit(1);
}

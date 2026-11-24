#!/usr/bin/env node
/**
 * 一键向 Codex (~/.codex/config.toml) 注入或移除 wv-agent 远程 MCP 配置。
 * 零外部依赖，兼容 macOS / Windows / Linux，可单独拷贝分发（不含任何服务端源码）。
 *
 * 用法：
 *   node install-codex-mcp.mjs
 *   node install-codex-mcp.mjs --url http://47.106.103.79/wv-agent/mcp
 *   node install-codex-mcp.mjs --url http://47.106.103.79/wv-agent/mcp --api-key YOUR_KEY
 *   node install-codex-mcp.mjs --remove
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

function escapeTomlString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatSectionKey(name) {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : `"${escapeTomlString(name)}"`;
}

/**
 * Remove any existing [mcp_servers.<name>] section (and its direct key-values) from TOML text.
 * Preserves all other sections and comments untouched.
 */
function stripServerSection(tomlText, serverName) {
  const lines = tomlText.split(/\r?\n/);
  const keyPlain = `mcp_servers.${serverName}`;
  const keyQuoted = `mcp_servers."${escapeTomlString(serverName)}"`;
  const out = [];
  let skipping = false;
  let removed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (headerMatch) {
      const tableName = headerMatch[1].trim();
      if (
        tableName === keyPlain ||
        tableName === keyQuoted ||
        tableName.startsWith(`${keyPlain}.`) ||
        tableName.startsWith(`${keyQuoted}.`)
      ) {
        skipping = true;
        removed = true;
        continue;
      }
      skipping = false;
    }
    if (!skipping) {
      out.push(line);
    }
  }

  // Collapse excessive trailing blank lines
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return { text: out.length > 0 ? out.join('\n') + '\n' : '', removed };
}

function buildTomlBlock({ serverName, serverUrl, apiKey }) {
  const lines = [
    `[mcp_servers.${formatSectionKey(serverName)}]`,
    `url = "${escapeTomlString(serverUrl)}"`,
  ];
  if (apiKey) {
    lines.push(`http_headers = { Authorization = "Bearer ${escapeTomlString(apiKey)}" }`);
  }
  return lines.join('\n') + '\n';
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Usage:
  node install-codex-mcp.mjs [--url <mcpUrl>] [--name <serverName>] [--api-key <key>] [--config <path>]
  node install-codex-mcp.mjs --remove [--name <serverName>] [--config <path>]`);
    return;
  }

  const configPath = path.resolve(flags.config || path.join(os.homedir(), '.codex', 'config.toml'));
  const serverName = String(flags.name || DEFAULT_NAME).trim();
  const serverUrl = String(flags.url || DEFAULT_URL).trim();
  const apiKey = flags['api-key'] ? String(flags['api-key']).trim() : '';
  const isRemove = Boolean(flags.remove || flags.uninstall);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let existing = '';
  let backupPath = null;
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf8');
    backupPath = `${configPath}.bak-${Date.now()}`;
    fs.copyFileSync(configPath, backupPath);
  }

  const stripped = stripServerSection(existing, serverName);

  if (isRemove) {
    fs.writeFileSync(configPath, stripped.text, 'utf8');
    console.log(
      JSON.stringify(
        {
          ok: true,
          target: 'codex',
          action: 'remove',
          serverName,
          existed: stripped.removed,
          configPath,
          backupPath,
        },
        null,
        2
      )
    );
    return;
  }

  const block = buildTomlBlock({ serverName, serverUrl, apiKey });
  const nextContent = stripped.text ? `${stripped.text}\n${block}` : block;
  fs.writeFileSync(configPath, nextContent, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        target: 'codex',
        action: 'install',
        serverName,
        serverUrl,
        replacedExisting: stripped.removed,
        configPath,
        backupPath,
        tip: '配置已写入 Codex config.toml，重启或新建 Codex 会话后即可直接调用 wv_* MCP 工具。',
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

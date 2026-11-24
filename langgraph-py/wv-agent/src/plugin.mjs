import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
}

export function getDefaultInstallDirs({
  pluginName = 'wv-agent',
  antigravityRoot,
  codexRoot,
} = {}) {
  const home = os.homedir();
  const agBase = antigravityRoot || path.join(home, '.gemini', 'config', 'plugins');
  const codexBase = codexRoot || path.join(home, '.codex', 'skills');
  return {
    antigravity: path.join(agBase, pluginName),
    codex: path.join(codexBase, pluginName),
  };
}

function renderSkillMarkdown({ pluginName, pkgName, binName, target }) {
  const isCodex = target === 'codex';
  const invokeHint =
    pkgName && pkgName !== binName
      ? `如未全局安装 \`${binName}\`，可使用 \`npx -y ${pkgName} <command>\` 执行。`
      : `如未全局安装 \`${binName}\`，可使用 \`npx -y ${binName} <command>\` 执行。`;

  const frontmatterDesc = isCodex
    ? 'WebView self-testing & MeiYouJSBridge (Android/iOS/HarmonyOS) protocol debugging via CLI. Use for inspecting real phone WebViews, testing UI flows, calling/diffing JSBridge protocols, checking errors, and syncing traces to meetyou.bridge-debug.'
    : 'WebView 自测与 MeiYouJSBridge（Android / iOS / 鸿蒙）三端协议联调技能。用于操控扫码打开的真机本地 WebView 页面、主动触发或录制 JSBridge 报文、三端协议 Diff、检查 Console/Network 异常、拉取原生日志及真机截屏验收。';

  return `---
name: ${pluginName}
description: ${frontmatterDesc}
---

# \`${pluginName}\` — WebView 自测与 JSBridge 联调指南

## 工具入口（npm CLI，支持 macOS & Windows）

本插件不包含工具源码，通过已发布的 npm 包 CLI 执行命令：

\`\`\`bash
# 推荐：全局安装一次 npm 包后直接运行
${binName} <command>

# 或免安装直接通过 npx 运行
npx -y ${pkgName} <command>
\`\`\`

> ${invokeHint}
> 所有命令默认输出 JSON（可显式加 \`--json\`），默认连接本机 Hub \`127.0.0.1:19527\`（可通过 \`--port\` 或 \`WV_AGENT_PORT\` 覆盖）。

## 标准自测与联调 SOP

### 第 1 步：确认 Hub 与真机 WebView 在线
\`\`\`bash
${binName} devices --json
\`\`\`
- 如果 \`hub.online === false\`，先在后台启动 Hub：\`${binName} hub\`
- 确认 \`hub.devices\` 中目标端（\`android\` / \`ios\` / \`harmony\`）处于 \`connected: true\` 且 \`hasBridge: true\`。
- 若手机端刚打开页面但 \`devices\` 为空：检查本地 dev 服务是否已挂载 \`${pkgName}/middleware\`，或是否白屏；Android/鸿蒙可用 \`${binName} cdp --os android|harmony\` 排查。

### 第 2 步：功能自测闭环（先清空历史记录再跑）
\`\`\`bash
${binName} clear -d android
${binName} snapshot -d android
${binName} act click e3 -d android
${binName} act fill e5 --value "测试内容" -d android
${binName} bridge trace -d android
${binName} inspect -d android
\`\`\`

### 第 3 步：JSBridge 协议专项联调与三端 Diff
- 读取业务侧的协议定义（如 \`sdk.ts\` 或 \`@meetyou/toolbox/lib/jssdk\` 调用处），提取 \`callNative(path, params, cb)\` 的协议 \`path\` 与参数结构。
- 单端调用（默认 8s 超时检测，专抓“客户端丢回调”）：
  \`\`\`bash
  ${binName} bridge call "userInfo/get" '{}' -d android --timeout 8000
  ${binName} bridge call "userInfo/get" '{}' -d harmony --timeout 8000
  \`\`\`
- **三端一致性对比：** 当 Android / iOS / 鸿蒙多台测试机同时在线时，自动输出字段缺失与类型差异：
  \`\`\`bash
  ${binName} bridge diff "userInfo/get" '{}' --devices android,harmony
  \`\`\`
- 涉及原生界面交互的协议（选图、裁切、权限弹窗、分享面板），适当放宽 \`--timeout 30000\` 并提示用户在真机上完成原生操作。

### 第 4 步：双端日志对账与真机截屏终验（需 USB 或无线 ADB/HDC）
\`\`\`bash
${binName} logs --os android --grep MeiYouJSBridge --lines 100
${binName} logs --os harmony --grep MeiYouJSBridge --lines 100
${binName} screenshot --os android -o ./wv-android.png
${binName} screenshot --os harmony -o ./wv-harmony.jpeg
\`\`\`

### 第 5 步：同步真机协议数据到 \`meetyou.bridge-debug\`
\`\`\`bash
${binName} bridge export-debug -d android --target http://127.0.0.1:1234/__bridge-debug__
\`\`\`
同步后在 PC 浏览器访问目标页面并追加 \`&bridgeDebug=replay&bridgeDebugServer=http://localhost:1234&bridgeDebugLog=1\` 即可回放真机协议数据。

## 汇报规范
完成自测或协议联调后，输出简明结构化报告：
1. **已测设备与页面 URL**（Android / iOS / 鸿蒙）
2. **功能交互结果**（每步通过/失败，失败时的 Console/Network 异常）
3. **JSBridge 协议核对 & 三端 Diff**（超时、报错、字段缺失或类型不一致项）
4. **视觉截屏检查结果**（如有截图：白屏、遮挡、样式异常）
`;
}

function renderAntigravityManifest({ pluginName, version }) {
  return {
    name: pluginName,
    displayName: 'WV Agent (WebView & JSBridge)',
    version,
    description:
      'WebView real-device self-testing and MeiYouJSBridge protocol debugging across Android, iOS, and HarmonyOS.',
    suggestedPrompts: [
      '用 wv-agent 查看当前在线的安卓/iOS/鸿蒙真机并检查页面状态',
      '帮我用 wv-agent 在安卓和鸿蒙真机上自测当前页面的核心交互与报错',
      '用 wv-agent bridge diff 对比安卓和鸿蒙的 userInfo/get 协议返回差异',
    ],
  };
}

function renderCodexOpenAiYaml({ pluginName }) {
  return `interface:
  display_name: "WV Agent"
  short_description: "WebView self-testing & MeiYouJSBridge protocol debugging for Android, iOS, and HarmonyOS"
  default_prompt: "Use $${pluginName} to inspect online WebView devices, run UI self-tests, and diff JSBridge protocols."
`;
}

function renderPluginReadme({ pluginName, pkgName, binName, target }) {
  const title = target === 'antigravity' ? 'Antigravity Plugin' : 'Codex Skill';
  return `# ${pluginName} (${title})

该插件包仅包含 AI 技能说明与元数据，**不包含任何业务或工具源码**。

## 前置依赖
请先从 npm 安装 CLI 工具（或确保 \`npx -y ${pkgName}\` 可用）：

\`\`\`bash
npm install -g ${pkgName}
\`\`\`

验证安装：
\`\`\`bash
${binName} --help
\`\`\`

## 一键安装 / 卸载
\`\`\`bash
${binName} plugin install --target all
${binName} plugin status
${binName} plugin uninstall --target all
\`\`\`
`;
}

function writeCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function emitAntigravityPlugin(destDir, opts) {
  writeCleanDir(destDir);
  const skillDir = path.join(destDir, 'skills', opts.pluginName);
  fs.mkdirSync(skillDir, { recursive: true });

  fs.writeFileSync(
    path.join(destDir, 'plugin.json'),
    JSON.stringify(renderAntigravityManifest(opts), null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(destDir, 'README.md'),
    renderPluginReadme({ ...opts, target: 'antigravity' }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    renderSkillMarkdown({ ...opts, target: 'antigravity' }),
    'utf8'
  );

  return [
    path.join(destDir, 'plugin.json'),
    path.join(destDir, 'README.md'),
    path.join(skillDir, 'SKILL.md'),
  ];
}

function emitCodexPlugin(destDir, opts) {
  writeCleanDir(destDir);
  const agentsDir = path.join(destDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  fs.writeFileSync(
    path.join(destDir, 'SKILL.md'),
    renderSkillMarkdown({ ...opts, target: 'codex' }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(agentsDir, 'openai.yaml'),
    renderCodexOpenAiYaml(opts),
    'utf8'
  );
  fs.writeFileSync(
    path.join(destDir, 'README.md'),
    renderPluginReadme({ ...opts, target: 'codex' }),
    'utf8'
  );

  return [
    path.join(destDir, 'SKILL.md'),
    path.join(agentsDir, 'openai.yaml'),
    path.join(destDir, 'README.md'),
  ];
}

function resolveTargets(target = 'all') {
  const t = String(target || 'all').toLowerCase();
  if (t === 'all') return ['antigravity', 'codex'];
  if (t === 'antigravity' || t === 'codex') return [t];
  throw new Error(`Unsupported target "${target}". Use all | antigravity | codex.`);
}

export function buildPlugins({
  outDir = path.join(PKG_ROOT, 'dist', 'plugins'),
  target = 'all',
  pluginName,
  pkgName,
  binName = 'wv-agent',
} = {}) {
  const pkg = readPackageJson();
  const resolvedPkg = pkgName || pkg.name || 'wv-agent';
  const resolvedName = (pluginName || 'wv-agent').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const opts = {
    pluginName: resolvedName,
    pkgName: resolvedPkg,
    binName,
    version: pkg.version || '0.1.0',
  };

  const targets = resolveTargets(target);
  const absOut = path.resolve(outDir);
  const outputs = {};

  if (targets.includes('antigravity')) {
    const dir = path.join(absOut, 'antigravity', resolvedName);
    outputs.antigravity = { dir, files: emitAntigravityPlugin(dir, opts) };
  }

  if (targets.includes('codex')) {
    const dir = path.join(absOut, 'codex', resolvedName);
    outputs.codex = { dir, files: emitCodexPlugin(dir, opts) };
  }

  return {
    ok: true,
    action: 'build',
    pluginName: resolvedName,
    pkgName: resolvedPkg,
    binName,
    containsSourceCode: false,
    outDir: absOut,
    outputs,
  };
}

export function installPlugins({
  target = 'all',
  pluginName,
  pkgName,
  binName = 'wv-agent',
  antigravityRoot,
  codexRoot,
} = {}) {
  const pkg = readPackageJson();
  const resolvedPkg = pkgName || pkg.name || 'wv-agent';
  const resolvedName = (pluginName || 'wv-agent').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const opts = {
    pluginName: resolvedName,
    pkgName: resolvedPkg,
    binName,
    version: pkg.version || '0.1.0',
  };

  const dirs = getDefaultInstallDirs({
    pluginName: resolvedName,
    antigravityRoot,
    codexRoot,
  });
  const targets = resolveTargets(target);
  const installed = {};

  if (targets.includes('antigravity')) {
    installed.antigravity = {
      dir: dirs.antigravity,
      files: emitAntigravityPlugin(dirs.antigravity, opts),
    };
  }

  if (targets.includes('codex')) {
    installed.codex = {
      dir: dirs.codex,
      files: emitCodexPlugin(dirs.codex, opts),
    };
  }

  return {
    ok: true,
    action: 'install',
    pluginName: resolvedName,
    pkgName: resolvedPkg,
    binName,
    containsSourceCode: false,
    installed,
  };
}

export function uninstallPlugins({
  target = 'all',
  pluginName = 'wv-agent',
  antigravityRoot,
  codexRoot,
} = {}) {
  const resolvedName = pluginName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const dirs = getDefaultInstallDirs({
    pluginName: resolvedName,
    antigravityRoot,
    codexRoot,
  });
  const targets = resolveTargets(target);
  const removed = {};

  for (const t of targets) {
    const dir = dirs[t];
    const existed = fs.existsSync(dir);
    if (existed) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    removed[t] = { dir, existed, removed: existed };
  }

  return { ok: true, action: 'uninstall', pluginName: resolvedName, removed };
}

export function getPluginStatus({
  pluginName = 'wv-agent',
  antigravityRoot,
  codexRoot,
} = {}) {
  const resolvedName = pluginName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const dirs = getDefaultInstallDirs({
    pluginName: resolvedName,
    antigravityRoot,
    codexRoot,
  });

  const antigravityInstalled = fs.existsSync(path.join(dirs.antigravity, 'plugin.json'));
  const codexInstalled = fs.existsSync(path.join(dirs.codex, 'SKILL.md'));

  return {
    ok: true,
    pluginName: resolvedName,
    antigravity: {
      installed: antigravityInstalled,
      dir: dirs.antigravity,
    },
    codex: {
      installed: codexInstalled,
      dir: dirs.codex,
    },
  };
}

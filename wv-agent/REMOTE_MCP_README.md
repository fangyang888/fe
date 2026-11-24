# WV Agent 远程 MCP 接入指南

> **无需安装任何 npm 包、无需在本地启动 Hub、无需插 USB 线、不暴露服务端源码。**
> 只要两步：**① AI 工具配远程 MCP 地址** + **② 前端开发页引入一行远程探针脚本**，手机（Android / iOS / 鸿蒙）扫码打开本地页面后即可直接让 AI 自测与联调 `MeiYouJSBridge`。

---

## 线上服务地址

| 用途 | 地址 |
| :--- | :--- |
| **远程 MCP 地址**（填进 Antigravity / Codex） | `http://47.106.103.79/wv-agent/mcp` |
| **浏览器探针脚本**（注入到开发态 HTML） | `http://47.106.103.79/wv-agent/client.js` |
| **服务健康检查**（查看在线设备数） | `http://47.106.103.79/wv-agent/health` |

---

## 第 1 步：AI 工具接入远程 MCP（一键脚本 / 手动配置）

> 仓库内置了两个**独立零依赖单文件脚本**（兼容 macOS & Windows，自动备份原配置，可重复执行，不含任何服务端源码，可直接单独发给同事运行）：
> - **一键注入 Antigravity：** `node scripts/install-antigravity-mcp.mjs`（移除加 `--remove`）
> - **一键注入 Codex：** `node scripts/install-codex-mcp.mjs`（移除加 `--remove`）

### 方式 A：Antigravity（推荐：配置一次，全局生效）
打开 `~/.gemini/antigravity/mcp_config.json`（或插件目录 `~/.gemini/config/plugins/wv-agent/mcp_config.json`），在 `mcpServers` 里加入：

```json
{
  "mcpServers": {
    "wv-agent-mcp": {
      "serverUrl": "http://47.106.103.79/wv-agent/mcp"
    }
  }
}
```

> **或者直接一键安装 Antigravity 插件 + Codex 技能（含 `SKILL.md`）：**
> ```bash
> node /Users/yang/fe/fe/wv-agent/bin/wv-agent.mjs plugin install --mcp-url http://47.106.103.79/wv-agent/mcp
> ```

### 方式 B：Codex
在 `~/.codex/config.toml`（Windows 为 `%USERPROFILE%\.codex\config.toml`）末尾追加：

```toml
[mcp_servers.wv_agent_mcp]
url = "http://47.106.103.79/wv-agent/mcp"
```

保存后重启或新建 Codex 会话，即可自动识别 `wv_*` 工具。

### 方式 C：Cursor / Claude Code 等其他支持 Streamable HTTP MCP 的客户端
```json
{
  "mcpServers": {
    "wv-agent-mcp": {
      "type": "http",
      "url": "http://47.106.103.79/wv-agent/mcp"
    }
  }
}
```

> *(若后续服务端启用了 `WV_AGENT_API_KEY`，只需在配置中加请求头 `Authorization: Bearer <你的Key>`。)*

---

## 第 2 步：前端开发页接入远程探针（选 1 种即可，绝不进生产包）

### 方式 1：Vite 项目（如 `subscribe/ctrm.mjs`，零依赖，推荐发给同事直接用）
在 `commonViteConfig.plugins` 数组里加入这几行（`apply: 'serve'` 保证只在 `npm run dev` 生效，`build` / `zip` 完全忽略）：

```js
{
  name: 'wv-agent-remote-probe',
  apply: 'serve',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        attrs: { src: 'http://47.106.103.79/wv-agent/client.js' },
        injectTo: 'head-prepend',
      },
    ];
  },
},
```

*(如果你本机已经引入了 `wv-agent/src/middleware.cjs`，也可以直接写 `wvAgentVitePlugin({ remoteUrl: 'http://47.106.103.79/wv-agent' })`。)*

### 方式 2：最简临时接入（任何项目：Parcel / Webpack / Vue / React / 原生 HTML 通用）
在本地调试页面的 `<head>` 最前面临时加一行（发版前删掉）：

```html
<script src="http://47.106.103.79/wv-agent/client.js"></script>
```

### 方式 3：Parcel 1 / Webpack 3 / Express 项目（如 `puzzle/ctrm.js`）
在 `dev()` 中间件里配置：

```js
const createWvAgentMiddleware = require('/path/to/wv-agent/src/middleware.cjs');
app.use(createWvAgentMiddleware({ remoteUrl: 'http://47.106.103.79/wv-agent' }));
```

---

## 第 3 步：手机扫码进页面，直接跟 AI 对话自测

1. 本地启动你的前端开发服务（例如 `npm run dev`）；
2. 用 **Android / iOS / 鸿蒙** 测试机里的 App 扫码进入本地页面（如 `http://<电脑局域网IP>:1234/family.html`）；
3. 保持手机亮屏，直接在 Antigravity / Codex 里发话即可：

### 常用对话话术（直接复制）
- **确认连接：**
  > 调用 `wv_devices` 看看当前在线的安卓、iOS 和鸿蒙真机，确认 `hasBridge` 是不是 `true`。
- **整页功能自测：**
  > 用 `wv_snapshot` 和 `wv_act` 帮我在安卓和鸿蒙真机上自测当前页面的「关闭」和「添加」流程，跑完用 `wv_inspect` 检查有没有 Console 报错、Promise 异常或失败接口，并把测试账号恢复到初始状态。
- **单个 JSBridge 协议联调：**
  > 用 `wv_bridge_call` 在鸿蒙真机上调一下 `userInfo/get`（参数 `{}`），看看返回字段和耗时。
- **多端协议一致性 Diff：**
  > 用 `wv_bridge_diff` 同时在安卓和鸿蒙真机上跑 `userInfo/get` 和 `appInfo/get`，把字段缺失和类型不一致整理成表格。
- **追踪按钮点击触发的真实协议报文：**
  > 先调用 `wv_clear`，再帮我点一下页面上的「分享」按钮，用 `wv_bridge_trace` 把触发的 JSBridge 协议名、入参和回调贴给我。

---

## 第 4 步：可用 MCP 工具一览（9 个）

| 工具名 | 作用 |
| :--- | :--- |
| `wv_devices` | 列出当前在线的 Android / iOS / 鸿蒙真机 WebView 与 `hasBridge` 状态 |
| `wv_snapshot` | 获取页面精简可交互 DOM 快照（带元素编号 `e1, e2...` 与正文预览） |
| `wv_act` | 在真机 WebView 执行 `click` / `fill` / `scroll` / `reload` / `back` |
| `wv_eval` | 在真机 WebView 执行任意 JS 表达式并拿返回值 |
| `wv_bridge_call` | 直接调用 `window.MeiYouJSBridge.invoke(path, params)`（带超时检测，专抓丢回调） |
| `wv_bridge_diff` | 在多台在线真机上并发执行同一协议并自动输出字段缺失与类型 Diff |
| `wv_bridge_trace` | 读取页面交互期间自动录制的 `MeiYouJSBridge` 报文（手机息屏后仍可读缓存） |
| `wv_inspect` | 查看页面报错、未捕获 Promise 异常、Console 告警及失败的网络请求 |
| `wv_clear` | 清空指定设备或全部设备的缓存日志与 Trace |

---

## 第 5 步：服务端访问控制与运维（ECS）

你在阿里云 ECS 上可以直接通过 PM2 随时开关服务：

```bash
# 停止服务（立即切断所有外部 MCP 和探针访问）
pm2 stop wv-agent-mcp

# 恢复服务
pm2 start wv-agent-mcp

# 查看实时连接与调用日志
pm2 logs wv-agent-mcp --lines 50
```

如需给远程 MCP 加上访问密钥（防止知道域名的人随便调）：
在 ECS 的 `ecosystem.config.cjs` 的 `wv-agent-mcp.env` 中增加 `WV_AGENT_API_KEY: '你的密钥'` 并 `pm2 restart wv-agent-mcp --update-env`，之后所有 `/mcp` 请求必须携带 `Authorization: Bearer 你的密钥` 才能访问。

---

## 常见问题排查

1. **`wv_devices` 返回空列表？**
   - 检查 `http://47.106.103.79/wv-agent/health` 是否返回 `{"ok": true}`（确认服务未 `pm2 stop`）；
   - 确认前端开发页源码里已经加载了 `http://47.106.103.79/wv-agent/client.js`；
   - 确认手机没有息屏/切后台（息屏后系统会暂停 WebView 轮询，亮屏即可自动重连）。
2. **调用 `wv_bridge_call` 提示 `window.MeiYouJSBridge is not available`？**
   - 检查 `wv_devices` 里你选中的是不是电脑 Chrome 标签页（`platform: "web"`、`hasBridge: false`），请通过 `device: "android"` / `"harmony"` / `"ios"` 指定真机。
3. **之前配了本地 `wvAgentVitePlugin()`，怎么切到远程？**
   - 把 `wvAgentVitePlugin()` 改成 `wvAgentVitePlugin({ remoteUrl: 'http://47.106.103.79/wv-agent' })` 并重启前端 `npm run dev`，以后本机就不需要再起 `wv-agent hub` 了。

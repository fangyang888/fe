# wv-agent

面向 **AI Agent** 的 WebView 功能自测与 `MeiYouJSBridge`（Android / iOS / 鸿蒙）三端协议联调工具包，支持 **macOS & Windows**。

- **零外部 npm 依赖**：开箱即用，Hub + CLI 跑在 Node 18+，Connect 中间件兼容 Node 14+。
- **业务源码零改动**：探针自动 Hook `window.MeiYouJSBridge`（兼容 `MeiYouJSBridgeReady`），无缝支持 `@meetyou/toolbox/lib/jssdk` 和 `meetyou.bridge`。
- **三端统一**：手机和电脑连同一 Wi-Fi，扫码进入本地开发页即自动连入本机 Hub（无需插线）；插线或开启无线 ADB/HDC 后支持真机截屏、`logcat`/`hilog` 原生日志与 CDP 兜底。

---

## 一、安装 CLI 命令（macOS & Windows 通用）

### 方式 1：全局注册 `wv-agent` 命令（推荐，Win / Mac 写法完全一致）
在 `wv-agent` 目录下执行一次：

```bash
cd <你的路径>/wv-agent
npm link
```

注册后，无论在 macOS（zsh/bash）还是 Windows（PowerShell / CMD / Git Bash），都可以直接敲 `wv-agent ...`。

### 方式 2：不全局 link，临时设置快捷命令
- **macOS / Linux（zsh / bash）：**
  ```zsh
  alias wv-agent="node /path/to/wv-agent/bin/wv-agent.mjs"
  ```
  > 注意：在 zsh 中不要写 `CLI="node ..." && $CLI devices`，因为 zsh 默认不会拆分变量中的空格。

- **Windows（PowerShell）：**
  ```powershell
  function wv-agent { node "D:\path\to\wv-agent\bin\wv-agent.mjs" @args }
  ```

- **Windows（CMD）：**
  ```cmd
  doskey wv-agent=node "D:\path\to\wv-agent\bin\wv-agent.mjs" $*
  ```

---

## 二、快速上手（3 步）

### 第 1 步：启动本机调度中心（Hub）
单开一个终端运行（保持开启）：

```bash
wv-agent hub
# 默认监听 19527 端口，可用 --port 19528 指定端口
```

> **Windows 防火墙提示：** 首次启动时若系统弹出 Windows Defender 防火墙提示，请勾选「专用网络」并点击「允许访问」，否则手机无法通过局域网连上 `19527` 端口。

### 第 2 步：在前端开发服务里挂载中间件（仅 dev 生效，绝不进生产包）

将下面示例中的 `WV_AGENT_MIDDLEWARE` 替换为本机 `wv-agent/src/middleware.cjs` 的实际路径（Windows 路径可用正斜杠 `/` 或双反斜杠 `\\`）。

#### A. Vite 5 项目（如 `nodejs-user/modules/subscribe` 的 `ctrm.mjs`）
```js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { wvAgentVitePlugin } = require('/path/to/wv-agent/src/middleware.cjs');

// 放入 commonViteConfig.plugins 数组中（不要写在顶层）：
plugins: [
  // ...其他插件
  wvAgentVitePlugin(), // 或传 { onlyWhenEnv: true } 按环境变量按需开启
],
```

#### B. Parcel 1 + Express 项目（如 `puzzle` 的 `ctrm.js`，兼容 Node 14）
```js
const createWvAgentMiddleware = require('/path/to/wv-agent/src/middleware.cjs');

// 在 dev() 里、app.use(bundler.middleware()) 之前加一行：
app.use(createWvAgentMiddleware());
```

#### C. Webpack 3 / Express 老项目（如 `nodejs-user`）
在本地 dev Express `app` 业务路由之前加：
```js
const createWvAgentMiddleware = require('/path/to/wv-agent/src/middleware.cjs');
app.use(createWvAgentMiddleware());
```

#### 若配置了 `{ onlyWhenEnv: true }`，启动开发服务的命令：
- **macOS / Linux：**
  ```bash
  WV_AGENT=1 npm run dev
  ```
- **Windows（PowerShell）：**
  ```powershell
  $env:WV_AGENT="1"; npm run dev
  ```
- **Windows（CMD）：**
  ```cmd
  set WV_AGENT=1 && npm run dev
  ```

### 第 3 步：手机扫码进入本地页面，开始联调与 AI 自测
手机（Android / iOS / 鸿蒙）和电脑连在同一 Wi-Fi，App 扫码打开本地开发页（如 `http://<电脑局域网IP>:1234/family.html`）。页面加载后会自动连上本机 Hub，直接让 AI Agent 读取 [SKILL.md](./SKILL.md) 即可自动执行自测和协议联调。

---

## 三、常用 CLI 命令（macOS & Windows 对照）

```bash
# 1. 查看在线真机 WebView 与本机连接的 USB 设备
wv-agent devices

# 2. H5 页面可交互 DOM 快照 & 模拟操作
wv-agent snapshot -d harmony
wv-agent act click e2 -d harmony
wv-agent act fill e5 --value "测试内容" -d harmony
wv-agent inspect -d harmony

# 3. 录制页面业务操作触发的 JSBridge 报文
wv-agent bridge trace -d harmony

# 4. 同步真机协议数据到 meetyou.bridge-debug（供 PC 浏览器 replay）
wv-agent bridge export-debug -d harmony --target http://127.0.0.1:1234/__bridge-debug__
```

### 调用 JSBridge 协议与三端 Diff（注意 JSON 参数引号差异）

- **macOS / Linux（zsh / bash）：**
  ```bash
  wv-agent bridge call "userInfo/get" '{}' -d harmony
  wv-agent bridge diff "album/save" '{"images":["https://example.com/a.png"]}'
  ```
- **Windows（PowerShell）：**
  ```powershell
  wv-agent bridge call "userInfo/get" '{}' -d harmony
  wv-agent bridge diff "album/save" '{\"images\":[\"https://example.com/a.png\"]}'
  ```
- **Windows（CMD）：**
  ```cmd
  wv-agent bridge call userInfo/get "{}" -d harmony
  wv-agent bridge diff album/save "{\"images\":[\"https://example.com/a.png\"]}"
  ```

### 真机截图 / 原生日志 / CDP 兜底（需连接 USB 或无线 ADB/HDC）

- **macOS：**
  ```bash
  wv-agent screenshot --os android -o /tmp/android.png
  wv-agent screenshot --os harmony -o /tmp/harmony.jpeg
  wv-agent logs --os harmony --grep MeiYouJSBridge
  wv-agent cdp --os harmony
  ```
- **Windows（PowerShell / CMD）：**
  ```powershell
  wv-agent screenshot --os android -o .\android.png
  wv-agent screenshot --os harmony -o .\harmony.jpeg
  wv-agent logs --os harmony --grep MeiYouJSBridge
  wv-agent cdp --os harmony
  ```

> **自定义 `adb` / `hdc` 路径：**
> `wv-agent` 会自动探测 macOS 与 Windows 的默认 Android SDK / DevEco Studio 路径；如果安装在自定义目录，可设置环境变量覆盖：
> - **macOS：** `export ADB_PATH="/path/to/adb"`、`export HDC_PATH="/path/to/hdc"`
> - **Windows（PowerShell）：** `$env:ADB_PATH="D:\Android\Sdk\platform-tools\adb.exe"`、`$env:HDC_PATH="D:\DevEco\sdk\...\hdc.exe"`

---

## 四、常用跟 AI Agent 交互的话术模板（直接复制使用）

手机扫码打开页面后，直接把下面的话发给 AI Agent 即可（首次对话建议带上 `SKILL.md` 路径，让 Agent 严格按规范执行）。

### 1. 开场初始化（确认设备已连上）
> 请先阅读 `/Users/yang/fe/fe/langgraph-py/wv-agent/SKILL.md`，用 `wv-agent` 查看当前在线的真机设备，确认 Android / iOS / 鸿蒙是否都已连上且 `hasBridge: true`。

### 2. 页面功能自测（H5 交互 + 报错 + 接口 + Bridge 全查）
> 用 `wv-agent` 在当前在线的鸿蒙和安卓真机上，帮我自测这个页面：
> 1. 先清空旧日志，读取当前页面 DOM 快照；
> 2. 依次点击「规则」「添加」「关闭」等核心按钮，验证弹窗和交互是否正常；
> 3. 检查 Console 报错、未捕获 Promise 异常、失败的 HTTP 请求，以及交互触发的所有 JSBridge 报文；
> 4. 最后输出一份简明自测报告，列出发现的问题。

### 3. JSBridge 单个协议联调 & 边界测试
> 用 `wv-agent` 在鸿蒙真机上调用 `userInfo/get`（参数 `{}`），帮我检查返回了哪些字段、`nickName` 和 `avatar` 是否为空，顺便测一下 `tools/babyFeed/getBabyMonth` 传空参数和正常参数时的返回和耗时。

### 4. 自动读业务代码批量联调协议
> 读取当前项目里的 `src/utils/sdk.ts`（或 `@meetyou/toolbox/lib/jssdk` 调用处），列出页面用到的所有**纯数据类 JSBridge 协议**，用 `wv-agent` 在安卓和鸿蒙真机上逐条调用一遍，重点抓超时不回调、报错或返回空对象的协议。

### 5. Android / iOS / 鸿蒙三端协议一致性 Diff（直接生成客户端对账单）
> 我已经把安卓、iOS 和鸿蒙三台手机都扫码连上了，请用 `wv-agent bridge diff` 对 `userInfo/get`、`appInfo/get`、`newconfigs/get` 做三端一致性对比，整理成一张差异表（标出字段缺失、类型不一致、日期格式差异），方便我直接发给客户端同学联调。

### 6. 追踪某次业务操作的真实 Bridge 报文
> 先 `clear` 清空记录，然后帮我在鸿蒙真机上点一下页面里的「保存相册」按钮，通过 `bridge trace` 把这次点击实际发出去的 JSBridge 协议名、入参和客户端回调原样贴给我看。

### 7. 排错定位（判断是前端 Bug 还是客户端 Bug）
> 当前页面在鸿蒙上显示「昵称为空 / 点击无反应」，请用 `wv-agent` 帮我同时排查：
> - 调 `inspect` 看有没有 JS 异常或失败接口；
> - 调 `bridge call` / `bridge trace` 核对客户端实际返回了什么数据；
> - （如已插线）拉取 `logs --os harmony` 对照原生日志；
> 直接告诉我根因在前端还是客户端，如果在前端请直接帮我修复。

### 8. 改完代码后一键复测
> 我刚才已经改完前端代码了，请用 `wv-agent` 刷新安卓和鸿蒙真机页面，重新跑一遍刚才失败的用例，确认报错已消除且协议返回正常。

### 9. 视觉验收（需插 USB 或无线 ADB/HDC）
> 用 `wv-agent screenshot` 分别截取安卓和鸿蒙真机当前屏幕并查看图片，帮我检查有没有白屏、文字截断、弹窗错位，以及顶部状态栏/底部安全区遮挡问题。

### 10. 真机录协议 → 同步到 PC 浏览器回放
> 把安卓真机刚才录到的 JSBridge 协议数据通过 `wv-agent bridge export-debug` 同步到 `http://127.0.0.1:1234/__bridge-debug__`，方便我等会在 PC 浏览器用 `?bridgeDebug=replay` 调试样式。

---

## 五、远程 MCP 部署（`feat/v4` → `http://47.106.103.79/wv-agent`）

`wv-agent` 已内置标准 **MCP Streamable HTTP** 接口（`POST /mcp`）并与本仓库 `feat/v4` 的 PM2（`ecosystem.config.cjs`）、Nginx（`deploy/nginx.conf`）及 GitHub Actions（`.github/workflows/deploy.yml`）打通。

### 1. 服务端启停控制（随时开关外部访问）
push 到 `feat/v4` 自动部署后，在 ECS 上可以随时一键停用或恢复服务：
```bash
pm2 stop wv-agent-mcp     # 立即停止对外访问
pm2 start wv-agent-mcp    # 恢复服务
pm2 logs wv-agent-mcp     # 查看连接与调用日志
```
*(如需额外加固定访问密钥，可在 ECS 环境变量配置 `WV_AGENT_API_KEY`，客户端请求需携带 `Authorization: Bearer <key>`。)*

### 2. Antigravity & Codex 接入远程 MCP
- **一键安装远程 MCP 插件（推荐）：**
  ```bash
  node ./wv-agent/bin/wv-agent.mjs plugin install --mcp-url http://47.106.103.79/wv-agent/mcp
  ```
  - Antigravity 会自动生成 `~/.gemini/config/plugins/wv-agent/mcp_config.json` + `SKILL.md`；
  - Codex 会自动生成 `~/.codex/skills/wv-agent/SKILL.md` 和 `codex-mcp.toml`（将其中的 `[mcp_servers.wv_agent_mcp]` 粘到 `~/.codex/config.toml` 即可）。

### 3. 手机页面接入远程服务（无需本机开 Hub）
- **方式 A（一行 `<script>`）：** 在开发页加 `<script src="http://47.106.103.79/wv-agent/client.js"></script>`
- **方式 B（Vite / Express 中间件）：**
  ```js
  wvAgentVitePlugin({ remoteUrl: 'http://47.106.103.79/wv-agent' })
  ```

---

## 六、发布到你的 npm 仓库 & 一键打包/安装 Antigravity & Codex 插件

为了不把工具源码塞进插件目录，推荐先发布到你自己的（或公司私有）npm 仓库，再生成/安装纯技能插件（**插件内只含 `plugin.json`、`agents/openai.yaml` 与 `SKILL.md`，不含任何 JS 源码**）。

### 第 1 步：改包名并发布到你的 npm 仓库
1. 修改 `package.json` 中的 `"name"`（例如改为 `@your-scope/wv-agent` 或你的私有包名）。
2. 发布到你的 npm 源：
   ```bash
   cd wv-agent
   npm publish --registry <你的npm源地址>
   ```
   > 生产项目里引入中间件时，直接 `npm i -D <你的包名>`，然后 `require('<你的包名>/middleware')` 即可，彻底告别本机绝对路径。

### 第 2 步：打包生成 Antigravity & Codex 插件包（可选，用于分发或归档）
```bash
# 默认读取 package.json 的 name，输出到 ./dist/plugins/
wv-agent plugin build

# 或指定发布后的 npm 包名与输出目录
wv-agent plugin build --pkg @your-scope/wv-agent --out ./dist/plugins
```
生成结果（不含源码）：
- `dist/plugins/antigravity/wv-agent/`（含 `plugin.json`、`skills/wv-agent/SKILL.md`、`README.md`）
- `dist/plugins/codex/wv-agent/`（含 `SKILL.md`、`agents/openai.yaml`、`README.md`）

### 第 3 步：一键自动安装到本机 Antigravity 和 Codex（macOS & Windows 通用）
其他同事或你自己装完 npm 包后，只需执行**一条命令**即可同时装好 Antigravity 和 Codex 插件：

```bash
# 方式 A：先全局安装你的 npm 包，再一键安装双端插件
npm install -g @your-scope/wv-agent
wv-agent plugin install

# 方式 B：免全局安装，直接一条 npx 搞定
npx -y @your-scope/wv-agent plugin install --target all
```

支持的子命令与参数：
```bash
wv-agent plugin install --target all          # 同时安装到 Antigravity (~/.gemini/config/plugins/wv-agent) 和 Codex (~/.codex/skills/wv-agent)
wv-agent plugin install --target antigravity  # 仅安装到 Antigravity
wv-agent plugin install --target codex        # 仅安装到 Codex
wv-agent plugin status                        # 查看双端安装状态
wv-agent plugin uninstall --target all        # 一键卸载双端插件
```

---

## 六、运行内置自动化测试

```bash
cd wv-agent
npm test
```

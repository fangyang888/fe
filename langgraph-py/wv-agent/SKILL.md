---
name: wv-agent
description: WebView 自测与 MeiYouJSBridge（Android / iOS / 鸿蒙）三端协议联调技能。用于操控扫码打开的真机本地 WebView 页面、主动触发或录制 JSBridge 报文、三端协议 Diff、检查 Console/Network 异常、拉取原生日志及真机截屏验收。
---

# `wv-agent` — WebView 自测与 JSBridge 联调指南

## 工具入口

推荐先在 `wv-agent` 目录执行一次 `npm link` 全局注册 `wv-agent` 命令（macOS & Windows 通用）；若未全局安装，请直接调用脚本：

```bash
# macOS / Linux (zsh/bash)
node /Users/yang/fe/fe/langgraph-py/wv-agent/bin/wv-agent.mjs <command>

# Windows (PowerShell / CMD)
node <path-to-wv-agent>\bin\wv-agent.mjs <command>
```

> 注意：在 macOS `zsh` 中不要使用 `WV_CLI="node ..." && $WV_CLI ...`（zsh 不拆分变量内空格），请使用 `wv-agent` 或直接 `node .../wv-agent.mjs`。

所有命令默认输出 JSON（可显式加 `--json`），默认连接本机 Hub `127.0.0.1:19527`（可通过 `--port` 或 `WV_AGENT_PORT` 覆盖）。

## 标准自测与联调 SOP

### 第 1 步：确认 Hub 与真机 WebView 在线
```bash
wv-agent devices --json
```
- 如果 `hub.online === false`，先在后台启动 Hub：`wv-agent hub`
- 确认 `hub.devices` 中目标端（`android` / `ios` / `harmony`）处于 `connected: true` 且 `hasBridge: true`。
- 若手机端刚打开页面但 `devices` 为空：检查是否已接入开发态中间件，或页面是否发生白屏；Android/鸿蒙可用 `wv-agent cdp --os android|harmony` 走 CDP 排查启动阶段报错。

### 第 2 步：功能自测闭环（先清空历史记录再跑）
```bash
# 1. 清空旧日志与 trace
wv-agent clear -d android

# 2. 获取页面可交互元素快照（e1, e2...），优先用 DOM 交互而不是盲目截图
wv-agent snapshot -d android

# 3. 驱动业务操作（click / fill / scroll / reload）
wv-agent act click e3 -d android
wv-agent act fill e5 --value "测试内容" -d android

# 4. 核对业务操作自然触发的 JSBridge 调用参数与返回
wv-agent bridge trace -d android

# 5. 检查 Console 报错、未捕获 Promise 异常、4xx/5xx 接口失败
wv-agent inspect -d android
```

### 第 3 步：JSBridge 协议专项联调与三端 Diff
- 读取业务侧的协议定义文件（例如 `src/utils/sdk.ts` 或 `@meetyou/toolbox/lib/jssdk`），提取 `callNative(path, params, cb)` 中的协议 `path` 与参数结构。
- 单端调用（带超时检测，默认 8s，可抓“客户端丢回调”问题）：
  ```bash
  wv-agent bridge call "userInfo/get" '{}' -d android --timeout 8000
  wv-agent bridge call "tools/babyFeed/getBabyMonth" '{"birthday":"2025-01-01","date":"2025-10-14"}' -d harmony
  ```
- **三端一致性对比（强烈推荐）：** 当 Android / iOS / 鸿蒙多台测试机同时在线时，一条命令自动对比返回字段缺失、类型不一致、**空值差异**（如 `""` / `[]` / `{}` vs 有值）、**语义格式差异**（如 `YYYY-MM-DD` vs `YYYY/MM/DD`、秒级 vs 毫秒级时间戳、`https` vs `http`），并支持单端/多端**契约 Schema 校验**与一键输出 Markdown 对账单：
  ```bash
  # 基础三端对比（自动检出字段缺失、类型、空值、格式差异）
  wv-agent bridge diff "album/save" '{"images":["https://..."]}'

  # 忽略动态字段 + 精确值比对 + 直接输出 Markdown 对账单
  wv-agent bridge diff "newconfigs/get" '{}' --ignore traceId,meta.* --check-values --md

  # 契约 Schema 校验（即使只有 1 台真机在线也能验收必传/非空/格式/枚举）
  wv-agent bridge diff "userInfo/get" '{}' --devices harmony --schema '{"nickName":{"type":"string","nonEmpty":true},"avatar":{"type":"string","format":"url:https"}}'
  ```
- **需要原生界面交互的协议**（如 `album/selector`、`seeyoubaby/cloud/photosV2`、`share/do`、`login`、`album/save` 首次授权弹窗）：
  - 提示用户在真机上完成原生选图/授权，或结合 Midscene 处理原生弹窗，同时放宽 `--timeout 30000`。

### 第 4 步：双端日志对账与真机截屏终验
- 当某个协议报错、返回空对象或超时，立即拉取原生日志对照：
  ```bash
  wv-agent logs --os android --grep MeiYouJSBridge --lines 100
  wv-agent logs --os harmony --grep MeiYouJSBridge --lines 100
  ```
- 关键页面做视觉验收（检查白屏、样式错位、刘海屏/底部安全区遮挡）：
  ```bash
  wv-agent screenshot --os android -o ./wv-android.png
  wv-agent screenshot --os harmony -o ./wv-harmony.jpeg
  ```
  然后使用 `read_file` 查看截图文件并给出视觉验收结论。

### 第 5 步（可选）：在 PC 浏览器复用真机 JSBridge 返回值
- **方式 A — 实时透传（Live Proxy，免录制）**：PC 浏览器访问本地开发页时追加 `&bridgeDebug=live&bridgeDevice=android`（或具体 `clientId`，也支持简写 `&bridgeProxy=android` / `&bridgeProxy=1`），页面调用 `window.MeiYouJSBridge.invoke` 时会通过 Hub 实时转发到在线真机执行并把真机返回值回传给浏览器。
- **方式 B — 录制回放（同步到 `meetyou.bridge-debug`）**：如果项目已挂载 `meetyou.bridge-debug`（如 `nodejs-user/modules/subscribe`），可将真机录得的真实协议数据同步过去，供 PC 浏览器 `?bridgeDebug=replay` 极速回放：
```bash
wv-agent bridge export-debug -d android --target http://127.0.0.1:1234/__bridge-debug__
```

## 汇报规范
完成自测或协议联调后，向用户输出简洁的结构化结论：
1. **已测设备与页面 URL**（Android / iOS / 鸿蒙）
2. **功能流程结果**（通过/失败步骤、失败时的 Console/Network 异常）
3. **JSBridge 协议核对 & 三端 Diff**（列出超时、报错、字段缺失或类型不一致项）
4. **视觉截屏检查结果**（有无白屏、遮挡、样式异常）

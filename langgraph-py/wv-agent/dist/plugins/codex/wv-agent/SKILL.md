---
name: wv-agent
description: WebView self-testing & MeiYouJSBridge (Android/iOS/HarmonyOS) protocol debugging via CLI. Use for inspecting real phone WebViews, testing UI flows, calling/diffing JSBridge protocols, checking errors, and syncing traces to meetyou.bridge-debug.
---

# `wv-agent` — WebView 自测与 JSBridge 联调指南

## 工具入口（npm CLI，支持 macOS & Windows）

本插件不包含工具源码，通过已发布的 npm 包 CLI 执行命令：

```bash
# 推荐：全局安装一次 npm 包后直接运行
wv-agent <command>

# 或免安装直接通过 npx 运行
npx -y wv-agent <command>
```

> 如未全局安装 `wv-agent`，可使用 `npx -y wv-agent <command>` 执行。
> 所有命令默认输出 JSON（可显式加 `--json`），默认连接本机 Hub `127.0.0.1:19527`（可通过 `--port` 或 `WV_AGENT_PORT` 覆盖）。

## 标准自测与联调 SOP

### 第 1 步：确认 Hub 与真机 WebView 在线
```bash
wv-agent devices --json
```
- 如果 `hub.online === false`，先在后台启动 Hub：`wv-agent hub`
- 确认 `hub.devices` 中目标端（`android` / `ios` / `harmony`）处于 `connected: true` 且 `hasBridge: true`。
- 若手机端刚打开页面但 `devices` 为空：检查本地 dev 服务是否已挂载 `wv-agent/middleware`，或是否白屏；Android/鸿蒙可用 `wv-agent cdp --os android|harmony` 排查。

### 第 2 步：功能自测闭环（先清空历史记录再跑）
```bash
wv-agent clear -d android
wv-agent snapshot -d android
wv-agent act click e3 -d android
wv-agent act fill e5 --value "测试内容" -d android
wv-agent bridge trace -d android
wv-agent inspect -d android
```

### 第 3 步：JSBridge 协议专项联调与三端 Diff
- 读取业务侧的协议定义（如 `sdk.ts` 或 `@meetyou/toolbox/lib/jssdk` 调用处），提取 `callNative(path, params, cb)` 的协议 `path` 与参数结构。
- 单端调用（默认 8s 超时检测，专抓“客户端丢回调”）：
  ```bash
  wv-agent bridge call "userInfo/get" '{}' -d android --timeout 8000
  wv-agent bridge call "userInfo/get" '{}' -d harmony --timeout 8000
  ```
- **三端一致性对比：** 当 Android / iOS / 鸿蒙多台测试机同时在线时，自动输出字段缺失与类型差异：
  ```bash
  wv-agent bridge diff "userInfo/get" '{}' --devices android,harmony
  ```
- 涉及原生界面交互的协议（选图、裁切、权限弹窗、分享面板），适当放宽 `--timeout 30000` 并提示用户在真机上完成原生操作。

### 第 4 步：双端日志对账与真机截屏终验（需 USB 或无线 ADB/HDC）
```bash
wv-agent logs --os android --grep MeiYouJSBridge --lines 100
wv-agent logs --os harmony --grep MeiYouJSBridge --lines 100
wv-agent screenshot --os android -o ./wv-android.png
wv-agent screenshot --os harmony -o ./wv-harmony.jpeg
```

### 第 5 步：同步真机协议数据到 `meetyou.bridge-debug`
```bash
wv-agent bridge export-debug -d android --target http://127.0.0.1:1234/__bridge-debug__
```
同步后在 PC 浏览器访问目标页面并追加 `&bridgeDebug=replay&bridgeDebugServer=http://localhost:1234&bridgeDebugLog=1` 即可回放真机协议数据。

## 汇报规范
完成自测或协议联调后，输出简明结构化报告：
1. **已测设备与页面 URL**（Android / iOS / 鸿蒙）
2. **功能交互结果**（每步通过/失败，失败时的 Console/Network 异常）
3. **JSBridge 协议核对 & 三端 Diff**（超时、报错、字段缺失或类型不一致项）
4. **视觉截屏检查结果**（如有截图：白屏、遮挡、样式异常）

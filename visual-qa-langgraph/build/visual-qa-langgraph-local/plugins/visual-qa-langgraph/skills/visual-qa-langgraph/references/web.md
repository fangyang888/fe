# Web 验收

## Case

把 case 放在目标项目的验收目录，例如 `<项目>/artifacts/visual-qa-langgraph/`，不要放进插件目录。最小结构：

```json
{
  "name": "page-name",
  "platform": "web",
  "url": "http://127.0.0.1:3000/page",
  "designImage": "./design.png",
  "intentPlan": "./intent-plan.json",
  "outputDir": "./output",
  "viewport": { "width": 375, "height": 812, "deviceScaleFactor": 1 },
  "browserChannel": "chrome",
  "wait": {
    "readyExpression": "window.__VISUAL_READY__ === true",
    "timeoutMs": 15000,
    "networkIdle": true,
    "stableFrames": 3
  },
  "thresholds": {
    "pixelThreshold": 0.1,
    "maxMismatchPercent": 1.5,
    "minSsim": 0.98
  }
}
```

删除不适用于当前页面的字段。设计图和浏览器截图必须同尺寸；尺寸不一致时先修 viewport、DPR 或 `fullPage`，不要缩放基准图。

页面有底部安全区、Logo、Home Indicator、吸底按钮或绝对定位装饰时，除标准视口外增加同宽短视口 case，并设置 `fullPage: true`。用 `contract.relations` 校验 `gapY`、`gapX`、`alignLeft`、`alignTop` 或 `centerX`，再把多个 case 放进 suite。

需要元素测量时增加：

```json
{
  "contract": {
    "tolerance": 1,
    "failOnMismatch": true,
    "elements": [
      {
        "name": "button",
        "selector": "[data-visual='button']",
        "bounds": { "width": 300, "height": 48 },
        "styles": { "font-size": 16 },
        "relations": [
          { "target": "card", "metric": "gapY", "expected": 16 }
        ]
      }
    ]
  }
}
```

用户明确要求按钮、文字或图标独立验收时，可增加 `criticalRegions`。坐标使用设计 PNG 的整数物理像素，不能在看到实现后反推预期。

## 验收

先在目标项目启动真实页面。只运行目标入口，不运行会发布、上传或修改远端状态的脚本。

```sh
<qa> doctor --case <case>
<qa> verify --case <case> --compact
<qa> suite --suite <suite.json> --compact
```

`doctor` 只预检本地配置，不代表浏览通过。`verify` 会直接启动 Chrome，完成页面等待、资源与字体检查、布局稳定性、控制台、CSS、DOM 结构、设计测量、截图和视觉对比。`suite` 只执行 final 验收，并检查每个 case 使用独立输出目录。

需要复用外部浏览器连接时传 `--browser-endpoint`，支持 CDP HTTP、CDP WebSocket 或 Playwright WebSocket。没有 endpoint 时无需 Browser Server。

## 失败诊断

读取 `report.json` 中的 `comparison`、`capture.failures`、`differenceRegions` 和已有 `diagnosticCrops`：

1. 先确认是尺寸、DPR、整页裁切、状态或资源加载错误。
2. 再核对字体、图片、父容器尺寸、间距和定位上下文。
3. `domCandidates` 只用于缩小源码范围；不要输出完整 DOM 或整份报告。
4. 一次处理当前证据支持的全部局部问题，再重新截图。不要无修改重跑。
5. 仍无法定位时可构造与风险相符的 `contract` 或关键区域，但不能用当前实现生成预期。

视觉阈值通过不代表全部通过。`status: "passed"` 需要页面资源、字体、布局稳定性、控制台、CSS、结构和测量检查同时通过。退出码 0 表示 final passed，1 表示未通过，2 表示参数或执行异常。

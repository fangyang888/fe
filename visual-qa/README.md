# Visual QA

用于把 Pixso 设计稿基准图与本地 H5 的真实浏览器截图进行确定性对比。当前是独立 CLI，核心函数保持与传输协议无关，后续可直接包装为 MCP Server。

## 能力

- 使用固定 viewport、DPR、语言、时区和颜色模式截图。
- 等待网络空闲、指定元素、字体、图片和页面布局稳定。
- 禁用动画、过渡、光标和滚动动画。
- 使用 Pixelmatch 和 SSIM 比较设计图与实际截图。
- 输出 `actual.png`、`diff.png` 和 `report.json`。
- 图片加载失败、控制台错误或布局未稳定时，验收不会通过。
- 优先从 Pixso item id 生成图片导出计划，也支持红框标注补充识别。
- 只将页面真正使用的整图或分层图片转换为 Pixso MCP 导出清单。
- 校验 Pixso 位图导出尺寸；遇到阴影扩边时回退到画板 3x 裁切，只保留最终素材。
- 检查旧版移动端兼容布局：默认优先 Flex、禁止 Grid 和 `gap`。
- 检查页面自适应和生成器式异常 CSS。
- 支持 Git 变更区域验证、差异区域裁剪和文件哈希缓存。

## 安装

```bash
cd /Users/yang/fe/fe/visual-qa
npm install
npm run build
```

默认使用本机 Chrome，无需安装 Playwright Chromium。只有显式配置 `"browserChannel": "chromium"` 时才需要执行 `npm run install:browser`。

## 快速使用

### 截图

```bash
npm run visual-qa -- capture \
  --url http://127.0.0.1:3000/family-card \
  --output /tmp/family-card.png \
  --width 375 \
  --height 812 \
  --browser-channel chrome
```

`browserChannel` 默认是 `chrome`，直接使用本机 Chrome。需要改用 Playwright 自带浏览器时，显式传入 `--browser-channel chromium` 或在 case 中配置 `"browserChannel": "chromium"`，并先执行 `npm run install:browser`。

### 比较已有截图

```bash
npm run visual-qa -- compare \
  --expected /absolute/path/design.png \
  --actual /absolute/path/actual.png \
  --output /absolute/path/diff.png
```

### 完整验证

复制并修改 `cases/example.json`，将官方 Pixso MCP 的 `get_screenshot` 结果保存到 `designImage` 指定的位置，然后运行：

```bash
npm run visual-qa -- verify --case cases/example.json
```

低 Token 模式：

```bash
npm run visual-qa -- verify \
  --case cases/example.json \
  --changed-only \
  --top-regions 3 \
  --reuse-design \
  --no-ai-on-pass \
  --cache ./cache.json \
  --compact
```

通过时只输出一行：

```bash
npm run visual-qa -- verify --case cases/example.json --quiet
```

页面如果包含异步 Mock 或复杂渲染，应在稳定后设置：

```ts
window.__VISUAL_READY__ = true;
```

配置 `readyExpression` 后会自动跳过 `networkidle`，避免开发服务器的 HMR、WebSocket 或轮询请求让每轮检查多等待数秒。所有等待阶段共享同一个 `timeoutMs` 截止时间，不会再让网络、selector、表达式、字体、图片和布局分别重复消耗完整超时。

也可以在用例中删除 `readyExpression`，仅使用网络、字体、图片和布局稳定检测。此时 `networkidle` 最多占用统一等待预算中的 5 秒。

## 耗时统计

`capture`、`compare` 和 `verify` 的结果都包含 `timings`：

- 截图：浏览器获取、Context 创建、页面导航、就绪等待、结构检查、CSS 检查和截图。
- 页面就绪：network idle、selector、ready expression、字体、图片和布局稳定。
- 图片比较：PNG 读取、像素与 SSIM 比较、差异区域分析和文件写入。
- 完整验证：代码状态、缓存查询、截图、比较、诊断裁片和报告持久化。

使用低 Token 模式时，单行摘要也会保留总阶段耗时，可以直接判断瓶颈，无需读取完整报告。

## 复用 Chrome

在同一个 Node.js 进程中连续截图时，传入同一个 Browser；`visual-qa` 每次只创建并关闭隔离的 BrowserContext，不会关闭调用方持有的 Browser：

```ts
import {
  captureH5Screenshot,
  launchVisualQaBrowser,
} from "@internal/visual-qa/capture";

const browser = await launchVisualQaBrowser("chrome");
try {
  await captureH5Screenshot(firstCase, "first.png", { browser });
  await captureH5Screenshot(secondCase, "second.png", { browser });
} finally {
  await browser.close();
}
```

多个 CLI 调用之间复用同一个 Chrome 时，先启动 Browser Server：

```bash
npm run visual-qa -- browser-server --browser-channel chrome
```

命令会输出 `endpoint` 并保持运行。后续截图或验证传入该地址：

```bash
npm run visual-qa -- verify \
  --case cases/example.json \
  --mode agent \
  --browser-endpoint 'ws://127.0.0.1:PORT/ID'
```

每个 CLI 调用只断开自己的连接，Browser Server 中的 Chrome 会继续复用；任务结束后在 Server 终端按 `Ctrl+C` 关闭。

## Flex 兼容规则

`visual-qa` 默认按项目的 `iOS >= 8`、`Android >= 4` 目标检查可见页面：

- 发现 `display: grid` 或 `inline-grid` 时失败，要求优先改为 Flex。
- Flex/Grid 容器存在非零 `gap`、`row-gap` 或 `column-gap` 时失败，要求使用子元素 `margin`。
- 只对 `pageShellSelector` 明确指定的最外层页面壳检查自适应，禁止固定 `px` 宽高；内部组件、图片和绝对定位元素可以保留设计稿中的实际像素值。
- `position: absolute` 必须以当前页面检查范围内的定位祖先为基准。定位祖先超过 `positionContextMaxDepth` 层时给出警告，没有定位祖先时判为错误；通常应在最近的业务容器上设置 `position: relative`。
- 超过两位小数的 `px`、绝对定位同时声明 `left + right + width`（或 `top + bottom + height`）、CSS 内嵌 data 图片和 `zoom` 会被视为不可维护的生成器式 CSS，并默认以警告报告。
- 规则分为 `error`、`warning`、`info`。默认只有 `error` 使检查失败；设置 `failOnSeverity: "warning"` 可将警告也作为失败处理。
- 检查结果写入 `report.json` 的 `capture.cssRules`。

可以在 case 中限制检查范围、忽略第三方组件，或对特殊页面降级为仅报告：

```json
{
  "cssRules": {
    "preferFlex": true,
    "allowGap": false,
    "preferResponsivePage": true,
    "rejectSuspiciousCss": true,
    "failOnMismatch": true,
    "failOnSeverity": "error",
    "scopeSelector": "#app",
    "pageShellSelector": ":scope > .page",
    "positionContextMaxDepth": 2,
    "ignoreSelectors": [".third-party-widget"]
  }
}
```

推荐让需要绝对定位的装饰或图片就近绑定业务容器：

```scss
.member-card {
  position: relative;
}

.member-card__badge {
  position: absolute;
  right: 12px;
  top: 10px;
  width: 48px;
  height: 48px;
}
```

推荐的等价间距写法：

```scss
.list {
  display: flex;

  > * + * {
    margin-left: 12px;
  }
}
```

## 视觉结构意图

当验收不仅关心最终像素，还需要确认“整张卡片是一张图片”或“按钮底图上叠加了独立手指图片”时，可以在 case 中声明 `structure`：

```json
{
  "structure": {
    "failOnMismatch": true,
    "regions": [
      {
        "name": "member-card",
        "type": "single-image",
        "selector": "[data-visual='member-card']"
      },
      {
        "name": "claim-button",
        "type": "composite-image",
        "selector": "[data-visual='claim-button']",
        "base": {
          "selector": "[data-visual='claim-button-image']"
        },
        "overlays": [
          {
            "name": "finger",
            "selector": "[data-visual='claim-finger']",
            "mustOverlap": true,
            "mustOverflowBase": true,
            "mustBeAboveBase": true
          }
        ]
      }
    ]
  }
}
```

`single-image` 要求 selector 只匹配一个 `<img>` 或带 CSS `background-image` 的元素，默认不允许其中再出现可见子元素。`composite-image` 会分别检查容器、完整底图和每个独立叠加图，并验证叠加图是否与底图相交、是否需要超出底图边界，以及是否绘制在底图之上。检查结果会写入 `report.json` 的 `capture.structure`；`failOnMismatch` 为 `true` 时，结构不符合会使 `verify` 失败。

## 从 item id 或红框生成意图计划

### 优先使用 Pixso item id

已知图片节点时，推荐直接在意图配置中声明 `items`。这些 item id 会被视为明确的图片资源，直接进入 Pixso MCP 导出清单，不需要红框截图：

```json
{
  "items": [
    "138:97030",
    {
      "itemId": "138:97117",
      "name": "member-card",
      "format": "png",
      "bounds": { "x": 38, "y": 260, "width": 300, "height": 163 },
      "selector": "[data-visual='member-card']"
    }
  ],
  "hints": []
}
```

只使用 item id 时可以不传 `--annotated`、`--width` 和 `--height`：

```bash
npm run visual-qa -- intent-plan \
  --design-url "https://pixso.cn/app/design/FILE?item-id=138:97029" \
  --intent cases/intent-items.example.json \
  --output /absolute/path/intent-plan.json \
  --strict
```

`items` 支持两种写法：

- 字符串：最简声明，文件名自动生成为 `item-138-97030.png`。
- 对象：可以指定业务文件名、格式、选择器和精确 `bounds`。

`items` 是最高优先级。配置同时包含 `items` 和红框 `hints` 时，如果红框 hint 引用了相同 item id，该红框结果会被丢弃，避免重复导出。没有 `bounds` 的显式 item 仍会直接导出；如果节点可能带投影、模糊或发光，建议补充 `bounds`，这样才能启用 3x 尺寸校验和画板裁切回退。

旧的 `--hints` 参数仍然可用，等价于 `--intent`，已有脚本不需要立即迁移。

### 红框作为补充

`intent-plan` 会先锁定截图中占比最高的纯红标注色，再检测矩形边框，避免把按钮渐变、粉色插画或页面自身的红色误判成素材区域。随后自动寻找 Pixso 画布范围，去掉红框描边并映射到设计 viewport。红框相接或共边时也会分别识别。

```bash
npm run visual-qa -- intent-plan \
  --annotated /absolute/path/annotated.png \
  --design-url "https://pixso.cn/app/design/FILE?item-id=138:97029" \
  --output /absolute/path/intent-plan.json \
  --width 375 \
  --height 812 \
  --intent cases/intent-hints.example.json
```

如果截图包含编辑器背景且自动画布识别不准确，可以显式传入截图中的画布范围：

```bash
--frame 21,19,213,450
```

Hints 按红框从上到下、从左到右的顺序匹配，支持以下 `mode`：

- `single-image`：整体导出一张图片；提供 `nodeId` 时精确导出 Pixso 节点，否则按红框坐标从父节点截图裁切。
- `layers`：分别导出 `base-image` 与 `overlay-image` 等图层；每层需要 Pixso `nodeId` 或画布坐标。
- `dom-text`：不导出素材，页面使用 DOM 文字。
- `ignore`：系统 UI 或非业务区域，不实现也不导出。
- `review`：暂不确定，保留到 `ambiguities` 等待确认。

图片导出遵循“只生成最终会用到的素材”：

- 对不进入最终页面的红框或图层设置 `"export": false`；它会记录为 `not-used`，不会进入导出清单。
- 不要为图片节点内部的 vector、path、mask、ellipse 或阴影碎片分别生成素材。
- 位图提示应填写 Pixso 设计坐标 `bounds`。它既用于自适应布局校验，也用于剔除节点导出的效果扩边。
- SVG 保持矢量导出；照片、复杂插画和卡片使用 PNG。

不传 `--hints` 时，所有红框都会安全地标为 `review`。使用 `--strict` 可在仍有歧义时返回退出码 `1`。

## 生成 Pixso 导出清单

```bash
npm run visual-qa -- export-manifest \
  --plan /absolute/path/intent-plan.json \
  --output /absolute/path/export-manifest.json \
  --assets-dir src/assets/images \
  --format png \
  --scale 3
```

`--format` 和 `--scale` 均可省略；默认导出 PNG 三倍图。显式传入参数时以参数为准。

### 3x 位图效果扩边

Pixso 的节点 PNG 可能把投影、模糊或发光计入导出画布，导致图片像素尺寸大于 `bounds × scale`。导出清单会为带节点 ID 和设计坐标的位图写入 `dimensionPolicy`：

1. 先校验节点导出的像素尺寸是否等于设计宽高乘以倍率。
2. 尺寸不一致时，不允许靠 `overflow: hidden`、负定位、缩放或超长小数 CSS 修补。
3. 改用页面根节点的同倍率导出，并按精确设计坐标裁切。
4. 原始节点图和画板临时图都不进入业务目录，只保留 `file` 指向的最终素材。

显式 `items` 即使缺少 `bounds` 也会直接导出，但不会启用效果扩边校验；节点可能带投影、模糊或发光时，应从 Pixso 读取精确坐标补充 `bounds`，不要猜测中心裁切。

复用未变化的本地素材：

```bash
npm run visual-qa -- export-manifest \
  --plan /absolute/path/intent-plan.json \
  --output /absolute/path/export-manifest.json \
  --reuse-assets \
  --cache ./cache.json \
  --project-root /absolute/path/to/project \
  --compact
```

第一次运行会把素材 SHA-256 写入 `cache.json`。以后文件哈希未变化时，manifest 中对应资源的 `reuse.status` 为 `reuse`，编排端应跳过 Pixso MCP 导出；文件缺失或哈希变化时为 `export`。

## 低 Token 模式与缓存选项

页面生成和迭代时推荐显式选择验证模式：

```bash
# 高频开发迭代：不做 SSIM、差异区域、结构和 CSS 全量检查
npm run visual-qa -- verify --case cases/example.json --mode quick

# 交给 Agent：标准本地校验，stdout 仅一行摘要；失败时生成最多两个对比裁片
npm run visual-qa -- verify --case cases/example.json --mode agent

# 最终交付：执行完整验证并输出完整结果
npm run visual-qa -- verify --case cases/example.json --mode final
```

- `quick`：关闭 `networkidle`，最多等待 5 秒，只等待一个稳定帧；跳过结构、CSS、SSIM 和差异区域分析，适合连续调整页面。
- `agent`：执行完整本地校验。通过时不需要模型读取图片；失败时仅在 `diagnostics/` 生成最大的两个差异对比裁片，左侧为设计稿、右侧为实现，并只向 stdout 输出单行 JSON。
- `final`：保持完整报告和最终验收行为，也是默认模式。

无论使用哪种模式，完整验证结果都会保存到 `report.json`。Agent 应先读取单行摘要，仅在失败时打开 `diagnosticCrops`，不要重复读取完整设计图、页面截图或完整报告。

Agent 编排必须遵循以下低 Token 顺序：

1. Pixso 设计结构只读取一次；已提供 `items` 时只读取和导出这些 item id，不展开其内部 vector、path、mask 和 effect 子节点。
2. 首次实现后使用 `quick` 迭代，不把 `design.png`、`actual.png` 或 `diff.png` 发送给模型。
3. 接近完成时执行一次 `agent`。通过则直接结束；失败只查看摘要中的 `diagnosticCrops`。
4. 只有差异裁片无法判断全局布局问题时，才允许读取完整截图。
5. 最终交付只执行一次 `final`；未改变的设计图和素材必须复用缓存。
6. 命令 stdout 不得输出完整 `report.json`、DOM、CSS 或 Pixso 节点树；需要深入诊断时按字段或文件片段读取。

### 缓存 Agent 上下文

将 case、图片意图、导出清单和最近一次报告压缩为一份可复用的小型上下文：

```bash
npm run visual-qa -- agent-context \
  --case cases/example.json \
  --plan artifacts/intent-plan.json \
  --manifest artifacts/export-manifest.json \
  --report artifacts/report.json \
  --output artifacts/agent-context.json
```

命令只向 stdout 返回一行 `created` 或 `cached` 以及文件路径，不输出上下文内容。缓存键包含输入文件和设计图内容哈希；任一输入变化都会自动失效。Agent 后续应优先读取 `agent-context.json`，只有字段缺失时才按需读取原始文件。

`quick` 和 `agent` 模式还会自动复用设计哈希、代码内容、case 配置和模式完全一致的验证报告。命中时不会启动浏览器、截图或重新比较，并在摘要中返回 `"cacheHit": true`。`final` 默认强制重验；确定页面运行数据稳定时可显式添加 `--reuse-verification`。

缓存只能避免重复读取和重复计算。若把缓存中的完整 Pixso 响应再次发送给模型，仍然会消耗 Token；因此缓存内容必须是 `agent-context.json` 这样的压缩语义，而不是原始节点树。

- `--compact`：只输出状态、像素差、SSIM、最大差异区域和缓存摘要。
- `--quiet`：验证通过时只输出一行；失败时仍输出完整诊断。
- `--changed-only`：读取 Git 变更文件，只比较 case 中映射到的区域。
- `--top-regions 3`：`report.json` 只保留像素变化最大的三个区域。
- `--reuse-design`：设计节点版本和设计图哈希一致时标记为复用。
- `--reuse-assets`：素材文件 SHA-256 与缓存一致时标记为复用。
- `--no-ai-on-pass`：本地验收通过时在报告中标记无需图片理解。
- `--cache ./cache.json`：指定缓存位置；`verify` 默认写入项目根目录的 `cache.json`。

`--changed-only` 需要在 case 中配置源码到截图区域的映射：

```json
{
  "changeDetection": {
    "projectRoot": "../..",
    "baseRef": "HEAD",
    "regions": [
      {
        "name": "claim-button",
        "bounds": { "x": 26, "y": 396, "width": 323, "height": 107 },
        "sourcePatterns": ["src/family-card/claim-button/**"]
      }
    ]
  }
}
```

路径匹配以 Git 仓库根目录为基准。没有匹配到配置区域时会回退整页比较，并在报告中写明原因，避免静默漏检。

`cache.json` 记录：

- Pixso 节点 ID、节点版本、设计图路径及 SHA-256。
- 素材路径、SHA-256、文件大小和修改时间。
- Git revision、包含未提交文件内容的代码版本哈希及变更文件。
- 每个 case 最近一次验收状态、代码版本、设计版本和报告路径。

导出清单中的操作有两种：

- `pixso-node-export`：调用 Pixso MCP `get_export_image` 精确导出指定节点。
- `pixso-frame-export-crop`：调用 Pixso MCP `get_export_image` 导出父节点同倍率图片，再按缩放后的设计坐标裁切。

`export-manifest` 只生成确定性的执行计划，不在 Node CLI 内直接连接某个 MCP transport。Codex 等编排端读取 manifest 后调用 Pixso MCP，这样 CLI、MCP 服务与视觉验证保持解耦。

## 退出码

- `0`：视觉验收通过。
- `1`：截图差异超过阈值，或使用 `--strict` 时计划仍有歧义。
- `2`：配置、浏览器、页面加载或图片处理失败。

## 后续 MCP 封装

后续只需将以下函数注册成 MCP Tools，无需重写截图和对比逻辑：

- `captureH5Screenshot`
- `compareScreenshots`
- `verifyVisualCase`
- `createIntentPlan`
- `createExportManifest`

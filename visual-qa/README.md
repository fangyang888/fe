# Visual QA

## 页面生成快速路径

Web `verify` 现在直接生成 `outputDir/comparison.html`，与 report.json 一起提供设计、实现、差异图及原始状态、模式、指标和耗时。首版失败也有对比；只有 `final` 且 `passed` 才显示最终验收通过。无需另外生成对比 HTML。摘要包含 `html` 路径；报告仍是验收依据，旧报告不代表当前源码或执行失败的新一轮。

```bash
node scripts/run.mjs verify --case /absolute/project/visual-qa/case.json --mode adaptive --skip-code-scan --cache /absolute/project/visual-qa/cache.json --compact
```

`--skip-code-scan` 仅支持 Web：完全跳过 Git/源码指纹扫描，同时禁用验收结果缓存，每轮重新截图。它适合单页快速生成或禁止读取其它页面的任务；不跳过视觉、结构、CSS 或最终验收，不能与 `--changed-only`、`--reuse-verification` 组合。设计/素材缓存仍可使用。需要变化区域或代码身份缓存的任务保留原有行为。

未传 browser/endpoint 时，同一次 adaptive 的候选和自动 final 共用一个浏览器、分别创建隔离上下文，结束后关闭自有浏览器；用户传入的浏览器不关闭。多轮 CLI 调用仍推荐一次启动 browser-server 并复用 endpoint。首版直接看对比，集中修正；多组 CSS 假设使用 variants；adaptive 返回 complete 后无需再跑一次 final。

业务预览的 Node 版本以项目配置为准，与 QA 的 Node 18+ 分别预检。图片立即核对尺寸和边界，禁止把兄弟节点裁进指定图片或通过降低阈值提速。逐阶段耗时已在报告 timings 中；整体页面提速需要同类任务计时验证，不由单次 CLI 耗时推算。

## 批量 CSS 微调

`node <插件根目录>/scripts/run.mjs variants --variants <项目>/variants.json --compact`

配置参考 `cases/variants.example.json`：提供已有 Web case、项目输出目录以及显式的 CSS 候选（建议每批 4–8 组，最多 32 组）。路径相对配置文件，默认并发 4、上限 8。

自动加入 baseline；共享浏览器但隔离 BrowserContext，在等待字体、图片和布局稳定之前注入 CSS，不修改业务源码、不逐候选构建。每批只扫描一次源码和计算一次设计哈希，不复用候选验收结果。使用完整 final 检查，不放宽视觉阈值或图片边界。

每次运行使用独立输出目录，保留原始 JSON/HTML/JUnit 报告及 `ranking.json`。排序优先排除结构、CSS、测量、加载或控制台异常，然后按像素差异升序、SSIM 降序；包含相对 baseline 的改善百分点。best 可能是 baseline 或 null，不承诺候选必然改善；实验通过不等于源码交付通过，选定 CSS 写回源码后仍需 final 验收。仅支持 Web，不能用候选 CSS 重画 single-image 内部内容。

用于把 Pixso 设计稿基准图与 Web 浏览器截图或 HarmonyOS ArkUI 原生页面截图进行确定性对比。当前是独立 CLI，核心函数保持与传输协议无关，后续可直接包装为 MCP Server。

## Web 能力

- 使用固定 viewport、DPR、语言、时区和颜色模式截图。
- 等待网络空闲、指定元素、字体、图片和页面布局稳定。
- 忽略浏览器自动请求 favicon 产生的 404；其它脚本、样式、图片、接口和运行时错误仍会使验收失败。页面显式 `<img>` 引用的 favicon 加载失败仍属于图片失败。
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
- 支持环境与用例预检，提前发现浏览器、设计图、输出权限和 Harmony 设备问题。
- 支持多页面批量回归，输出 suite JSON、JUnit XML 与自包含 HTML 看板，便于接入 CI 和人工验收。

## Harmony 原生页面

同一个 CLI 支持 `platform: "harmony"`，旧用例缺省仍为 Web。Harmony **仅验收截图视觉差异**：复用 Pixelmatch、SSIM 和诊断裁图，不声称 DOM/CSS、原生组件或运行时检查通过。设备真机/模拟器身份无法可靠识别时标为 `unknown`，截图来源仍明确记录为 device 或 import。

```bash
node /absolute/path/to/visual-qa/scripts/run.mjs harmony-devices
node /absolute/path/to/visual-qa/scripts/run.mjs verify --case /absolute/path/to/project/harmony.json --page-ready --mode agent
```

复制 [设备用例](cases/harmony.example.json) 到目标项目，配置 designImage 和输出目录。`harmony-devices --hdc-path /absolute/path/to/hdc` 支持 SDK 内的工具路径；用例需要对应配置 `harmony.hdcPath`。只有一个可用设备时自动选择，多设备设置 `deviceId`；指定目标失效不回退其他设备。

| Harmony 字段 | 行为 |
|---|---|
| `deviceId` | 缺省 auto；支持连接 ID，多个可用目标必须指定 |
| `navigation` | manual（默认）、computer-use、configured |
| `bundleName` / `abilityName` | configured 必填；每轮启动已安装 Ability，不负责构建安装或深层导航 |
| `screenshot` | 显式导入本地 PNG，路径相对用例；不接触设备、不检查稳定性 |
| `capture.scope` | screen（默认）或 region |
| `capture.region` | region 必填 `{x,y,width,height}`，单位为原图物理像素，不能越界 |
| `timeoutMs` | 截图稳定性阶段时限，默认 15000，允许 100–60000ms；设备探测和启动是独立阶段 |
| `stableSamples` | 连续完全相同的内容区截图数，默认 2，允许 2–10 |
| `sampleIntervalMs` | 截图之间的等待间隔，默认 500，允许 50–5000ms |

manual/computer-use 必须先完成页面准备，再传本轮 `--page-ready`。Computer Use 由 Skill 检查当前工具和可控窗口并调用，CLI 不安装或启动插件。configured 每轮会启动 Ability；已手动进入深层页面时使用 manual/computer-use。稳定像素不证明业务页面正确，仍需确认目标状态。

只比较已有截图时使用 [导入用例](cases/harmony-import.example.json)，不需要 hdc 或 `--page-ready`。导入与设备采集是显式选择，设备失败不偷偷改用旧图。只接受 PNG；沿用现有 `designImage` 字段。设计图与整屏/裁切图尺寸必须相同，不自动拉伸；vp/fp、设计倍率和系统栏内容范围需在验收前对齐。

报告 `scope=native-screenshot-visual-only`；环境错误带 `failure.stage`（device/preparation/capture/alignment/comparison）。每轮原始 `raw.png`、对齐 `actual.png`、`diff.png` 和 diagnostics 保存在独立 capture 目录中，最新报告为 `outputDir/report.json`。通过退出码 0，验收或设备流程失败 1，配置/CLI 错误 2。没有设备的检测命令退出码 1。

原生验收每次重新读取截图，即使传 `--reuse-verification` 也不复用结果；`--reuse-design`、`--cache` 不控制原生缓存。DOM/CSS/结构/浏览器等待配置、`measure`、浏览器参数及 `--changed-only` 不适用于原生模式。quick 只做像素比较；agent/final 追加 SSIM 和失败区域裁图。

完整 agent 流程见 [Harmony Skill 参考](skills/visual-qa/references/harmony.md)。设备命令依据 [OpenHarmony hdc 文档](https://github.com/openharmony/docs/blob/master/en/device-dev/subsystems/subsys-toolchain-hdc-guide.md) 和 [UITest 截图文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/application-test/uitest-guidelines.md)，实际设备/SDK 能否使用仍需连接验证。

## 安装

```bash
cd /Users/yang/fe/fe/visual-qa
npm install
npm run build
```

默认使用本机 Chrome，无需安装 Playwright Chromium。只有显式配置 `"browserChannel": "chromium"` 时才需要执行 `npm run install:browser`。

## 环境与用例预检

首次接入、切换运行机器或遇到环境问题时先运行 `doctor`。不传 case 时检查 Node.js 和默认 Chrome；传入 case 后还会校验配置、设计图、输出目录，以及对应平台的浏览器或 Harmony 设备。导入 Harmony PNG 的用例不要求 hdc。

```bash
npm run visual-qa -- doctor --case cases/example.json --compact
npm run visual-qa -- doctor --case cases/harmony.example.json --hdc-path /absolute/path/to/hdc
```

只做静态配置和文件检查时可使用 `--skip-browser-launch`。报告状态为 `ready` 时退出码为 0；存在阻塞项时状态为 `blocked`、退出码为 1。warning 不会阻塞。

## 批量视觉回归与 CI

复制 [suite 示例](cases/suite.example.json)，在 `cases` 中放入多个 Web 或 Harmony 用例。路径相对于 suite 文件；公共验证选项写入 `defaults`，单个用例可通过 `options` 覆盖。

```bash
npm run visual-qa -- suite \
  --suite cases/suite.example.json \
  --concurrency 2 \
  --mode agent \
  --compact
```

默认生成 `suite-report.json`、`junit.xml` 和自包含的 `index.html` 汇总页。HTML 显示通过率、耗时、Mismatch、SSIM，并链接到每个 case 的设计图、实际截图、diff 和原始报告。可通过 `--output`、`--junit`、`--html` 修改路径，使用 `--fail-fast` 在首次失败后停止调度后续用例。已开始的并发用例会正常结束；未开始的用例记为 skipped。并发上限为 8，每个 case 使用自身输出目录下的缓存，避免并发覆盖共享缓存。

suite 通过时退出码为 0；视觉失败、用例执行错误或 fail-fast 跳过时为 1；suite 配置或 CLI 参数错误为 2。CI 可以直接发布 HTML、JSON、JUnit 和每个 case 的原始截图、diff、report 作为构建产物。

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

## 设计契约、DOM 测量和轮次差量

复制 `cases/contract.example.json`，把 Pixso 的关键尺寸、样式和关系填入 `contract`。此文件中的数值仅为示例，必须替换为设计数据；工具不会从当前页面反推并自动批准设计预期，也不会自动访问 Pixso。通过 `data-visual` 或明确的 CSS selector 对应页面元素。

```bash
# 只修明确的契约问题时：只测量 DOM，不读设计 PNG，不截图，不运行 Pixelmatch/SSIM
npm run visual-qa -- measure --case cases/contract.example.json

# 页面生成迭代：自动选择首次诊断、轻量迭代和最终验收
npm run visual-qa -- verify --case cases/contract.example.json --mode adaptive
```

`measure` 会等待 case 中的就绪条件，支持 `--browser-endpoint` 复用 Chrome。case 仍保留 `designImage` 路径，方便后续 verify；仅 measure 时该 PNG 不必存在。measure 不执行结构和 CSS 规则检查，退出码 `0` 表示契约、字体、图片、布局就绪及控制台检查通过，`1` 表示检查失败，`2` 表示配置或执行错误。

契约字段：

- `bounds`：可选的 `x/y/width/height`，均为 CSS 像素。`x/y` 使用文档坐标，不随滚动偏移；DPR 不影响这些值。
- `styles`：只读取声明的 kebab-case CSS 属性。数字用于计算值为 `px` 的属性，例如 `"font-size": 16`；字符串与浏览器 computed style 精确比较，例如 `"color": "rgb(255, 255, 255)"`、`"font-weight": "700"`。颜色不会自动做 hex/rgb 等价转换。
- `relations`：`target` 引用另一个元素的 `name`。`gapY` 为当前元素顶部减目标底部，`gapX` 为当前左侧减目标右侧，`alignLeft/alignTop` 为对应边差，`centerX` 为水平中心差。对齐时 `expected` 设为 `0`。
- `tolerance`：几何和数字样式的允许偏差，默认 `1` CSS px；每条关系可以覆盖，边界值视为通过。字符串精确匹配。
- `failOnMismatch`：默认 `true`，契约失败会使 verify 失败；设为 `false` 时 verify 仅报告契约偏差。measure 始终如实返回测量失败。

元素不存在、selector 匹配多项或元素没有可见布局框时都会报告问题。可见性检测不代表已检查遮挡、透明祖先或实际绘制效果，这些仍由截图兜底。自适应页面优先写间距和对齐关系，避免把所有设计绝对坐标写成约束。

stdout 仅返回单行摘要，最多 8 条偏差，新增和恶化问题优先。每条包含 `element/selector/property/expected/actual`，数值偏差还包含 `delta`（实际减预期）。完整证据在 `measurement.json`（measure）或 `report.json`（verify）。

同一输出目录的 `measurement-history.json` 保存最近一轮，measure 和 verify 共用历史；摘要返回新增、解决、改善、恶化、未变化的数量及最多 8 个已解决问题 ID。契约、URL、viewport 或环境配置变化会开始新基线。连续两轮没有问题解决或偏差缩小时，`recommendImageReview` 为 true。每个 case 使用独立输出目录，避免并发覆盖同一历史。

有契约时，quick/agent 默认重新测量，不复用旧验收报告；`--reuse-verification` 可显式启用，`--no-cache` 强制重验。缓存命中不推进轮次。请在 Git ignore 中排除输出目录和 cache 文件，避免验证产物进入代码指纹。

agent 模式会优先让 Agent 处理明确的契约偏差；当契约通过或连续两轮无改善，且图片比较失败时，才生成诊断裁片并设置 `imageReview: true`。图片比较本身仍照常执行，final 不降低验收标准。quick 仍不生成图片诊断，但会运行已声明的契约并在失败时计算少量差异区域坐标。

运行 `npm test` 检查契约计算和差量逻辑；`npm run test:browser` 使用本机 Chrome 验证真实 DOM、DPR、滚动、轮次记录及图片诊断升级流程。

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

`suite` 在没有传 `--browser-endpoint` 时会自动按 `browserChannel` 复用 Chrome；每个 case 仍创建独立 BrowserContext，避免 Cookie、Storage 和页面状态互相污染。Harmony case 不会启动浏览器。显式传入 endpoint 时由 Browser Server 负责复用。

## Flex 兼容规则

`visual-qa` 默认按项目的 `iOS >= 8`、`Android >= 4` 目标检查可见页面：

- 发现 `display: grid` 或 `inline-grid` 时失败，要求优先改为 Flex。
- Flex/Grid 容器存在非零 `gap`、`row-gap` 或 `column-gap` 时失败，要求使用子元素 `margin`。
- 先读取目标项目的 `AGENTS.md`、页面创建 skill 和构建配置确认单位策略。项目明确要求局部固定尺寸使用 rem 时，在 case 中开启 `preferRem: true`；页面自有样式中大于 `1px` 的 px 长度会作为错误，`1px` 及更细的发丝线可保留。项目没有明确单位约定时保持关闭，不猜测策略。
- 只对 `pageShellSelector` 明确指定的最外层页面壳检查自适应，禁止使用 `px/rem/em` 等绝对长度固定 `width`、`height`、`min/max-width` 或 `min/max-height`。页面壳应使用 `width: 100%`/`auto` 与内容驱动高度；需要铺满首屏时使用 `min-height: 100vh`/`100dvh`。确有桌面限宽需求时，把 `max-width` 放到内部内容容器。内部组件、图片和绝对定位元素仍可保留设计尺寸。
- 如果包含页面壳规则的同一页面样式表修改 `html` 的根字号或背景，检查会失败；未作用域的 `*` reset 会给出 warning。页面局部样式应复用项目全局 reset，背景写到页面壳，`box-sizing` 缺失时约束在页面壳及其后代。
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
    "preferRem": true,
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

把意图计划绑定到 Web 验收用例后，这项约束不再依赖手写 `structure`：

```json
{
  "intentPlan": "./intent-plan.json"
}
```

`intentPlan` 路径相对 case 文件解析。所有参与验收的 `single-image` 区域必须在 intent 配置中提供 selector；缺失 selector 会在验收开始前失败。计划生成的规则始终要求无可见子元素，手写 `structure` 不能把它降级。

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

- `single-image` 会在计划和清单中携带 `imageBoundary`：Pixso 访问模式为 `export-only`，禁止检查后代，页面实现必须是一张没有可见子元素的图片。编排端不得再读取该节点内部样式或图层。
- 对不进入最终页面的红框或图层设置 `"export": false`；它会记录为 `not-used`，不会进入导出清单。
- 不要为图片节点内部的 vector、path、mask、ellipse 或阴影碎片分别生成素材。
- 位图提示应填写 Pixso 设计坐标 `bounds`。它既用于自适应布局校验，也用于剔除节点导出的效果扩边。
- SVG 保持矢量导出；照片、复杂插画和卡片使用 PNG。

不传 `--hints` 时，所有红框都会安全地标为 `review`。使用 `--strict` 可在仍有歧义时返回退出码 `1`。

## 生成前图片边界检查

在第一次 `design_to_code` 和编写页面前执行，不需要启动浏览器或准备 case：

```bash
node scripts/run.mjs generation-context \
  --plan /absolute/path/intent-plan.json \
  --nodes /absolute/path/pixso-nodes.json \
  --output /absolute/path/generation-context.json
```

先锁定用户图片意图，再读取浅层布局；输入是单个 Pixso 根节点、`[根节点]` 或 `{ "nodes": [根节点] }`，使用真实 `guid` / `childNode` 结构，不是 JSX 或 MCP 文本外壳。命中用户图片 ID 后直接裁掉后代，只保留图片身份、selector 和外框；GROUP/FRAME 类型不会覆盖用户的图片声明。祖先的生成代码字符串也不会进入上下文。

输出含精简树、图片契约和 `codeGeneration.allowedNodeIds`。`tree` 保留父子容器与源同级顺序，每张图片的 `hierarchy` 记录父节点、祖先链和原始同级索引；`images` 仅是资产索引，不能据此把图片铺平成同级元素。外部叠放与遮挡关系继续由布局树实现。只对允许的非图片子树调用代码生成，包含图片的祖先由外部布局数据实现；不向图片节点或后代读取 DSL。节点缺失、画板不匹配、selector 缺失或意图未明确时返回退出码 1、清空允许列表；格式错误返回 2，均不能开始生成。成功返回 0。不带图片意图的页面仍可整页生成。

CLI 不拦截外部 MCP 调用，也不验证资源下载或实际页面；必须按 [Skill 前置流程](skills/visual-qa/references/generation-context.md) 消费裁剪后的上下文，随后沿用素材导出与 `verify` 检查。它避免先生成图片内部代码再返工，不替代最终视觉验收。

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
# 推荐的页面生成流程：自动在完整诊断、轻量迭代和最终复验间切换
npm run visual-qa -- verify --case cases/example.json --mode adaptive

# 手工高频开发迭代：不做 SSIM、结构和 CSS 全量检查
npm run visual-qa -- verify --case cases/example.json --mode quick

# 交给 Agent：标准本地校验，stdout 仅一行摘要；失败时生成最多两个对比裁片
npm run visual-qa -- verify --case cases/example.json --mode agent

# 最终交付：执行完整验证并输出完整结果
npm run visual-qa -- verify --case cases/example.json --mode final
```

- `adaptive`：首轮执行 agent 完整诊断；后续执行 quick 本地迭代；quick 像素失败时立即从当前截图生成局部诊断裁片，不额外截图，便于一次批量微调全部差异区域。quick 达标后在同一命令中自动执行 final；只有自动 final 通过才返回 `nextAction: "complete"`。仅支持 Web。
- `quick`：关闭 `networkidle`，最多等待 5 秒，只等待一个稳定帧；跳过结构、CSS 和 SSIM，失败时只计算少量差异区域坐标，不生成裁片，适合手工连续调整页面。
- `agent`：执行完整本地校验。通过时不需要模型读取图片；失败时仅在 `diagnostics/` 生成最大的两个差异对比裁片，左侧为设计稿、右侧为实现，并只向 stdout 输出单行 JSON。
- `final`：保持完整报告和最终验收行为，也是默认模式。

无论使用哪种模式，完整验证结果都会保存到 `report.json`。Agent 应先读取单行摘要，仅在失败时打开 `diagnosticCrops`，不要重复读取完整设计图、页面截图或完整报告。

### 生成前优先复用本地组件（可选 MCP）

页面生成由 Agent 编排：读取 Pixso 设计 → 搜索本地组件 → 生成或整合页面代码 → visual-qa 验收。visual-qa CLI 不直接连接 internal-components MCP，也不新增必需依赖。

- 在编写页面或新建组件前，检查当前是否可调用 `internal-components` 的 `search_internal_component`。工具可用时，按设计区域的功能搜索，传入目标项目的 `projectRoot`，并用 `sourceRoots` 限定允许读取的组件目录。
- 遵守用户排除的页面或目录；不要用全项目自动扫描绕过排除要求。无法限定安全搜索范围时，跳过该次 MCP 搜索。
- 根据返回的 Props、导入方式和源码确认适配性，优先复用功能和视觉符合设计的组件；没有合适组件时按项目规范实现。用户指定为图片的节点保持图片，不用组件重画内部视觉。
- **未发现该 MCP、工具不可调用、连接/读取失败、超时或权限不足时直接跳过**，继续现有页面生成及视觉验收流程。不要求安装或连接 MCP，不反复重试，不将它作为阻塞项；简单记录跳过原因即可。没有匹配结果同样继续实现。
- 复用组件后仍须执行 visual-qa，检查布局、图片结构和视觉差异；搜索命中不等于符合设计。

Agent 编排必须遵循以下低 Token 顺序：

1. Pixso 设计结构只读取一次；已提供 `items` 时只读取和导出这些 item id，不展开其内部 vector、path、mask 和 effect 子节点。
2. 首次生成前执行上述可选本地组件搜索；同一需求和源码未变化时复用已有搜索结果。首次实现后重复使用 `adaptive`，不手工编排 quick/agent/final，也不把 `design.png`、`actual.png` 或 `diff.png` 发送给模型。
3. `adaptive` 返回 `fix-local-differences` 时处理 DOM 摘要；返回 `inspect-diagnostic-crops` 时读取列出的局部裁片，并在一次修改中处理全部差异区域。禁止无修改重跑和单属性串行枚举。
4. 只有差异裁片无法判断全局布局问题时，才允许读取完整截图。
5. `adaptive` 的自动 final 通过并返回 `complete` 后结束；手工模式最终仍只执行一次 `final`。未改变的设计图和素材必须复用缓存。
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

- `0`：视觉验收或 suite 通过，doctor 环境就绪。
- `1`：截图差异超过阈值、suite 存在失败/错误/跳过、doctor 存在阻塞项，或使用 `--strict` 时计划仍有歧义。
- `2`：配置、浏览器、页面加载或图片处理失败。

## 后续 MCP 封装

后续只需将以下函数注册成 MCP Tools，无需重写截图和对比逻辑：

- `captureH5Screenshot`
- `compareScreenshots`
- `verifyVisualCase`
- `runDoctor`
- `runVisualSuite`
- `createIntentPlan`
- `createExportManifest`

## Codex 插件

当前目录同时是可独立使用的 CLI 项目和插件源码，manifest 位于 `.codex-plugin/plugin.json`，Skill 位于 `skills/visual-qa/SKILL.md`。插件编排页面实现与验收，保持 CLI 接口不变；不包含 `.mcp.json`，Pixso 与 internal-components 使用当前环境已有工具，后者不可用时直接跳过。

插件分发需包含 `.codex-plugin/`、`skills/`、`scripts/`、`src/`、`test/`、`cases/`、`package.json`、`package-lock.json`、`tsconfig.json`、`INSTALL.md` 和本 README。不要包含 `node_modules/`、项目截图、缓存或验收产物。新安装的插件在其实际根目录执行：

```bash
npm ci
npm run build
node scripts/run.mjs help
```

随后从业务项目目录调用 `node "<插件根目录>/scripts/run.mjs" verify --case "<用例路径>" --mode final`。入口基于自身位置解析 CLI，不依赖作者机器路径，保留调用方工作目录。运行时缺失时只报初始化步骤，不自动安装依赖。

安装插件后可用自然语言请求：“使用 Visual QA 根据这个 Pixso 设计实现页面，优先复用本地组件，并完成视觉验收。”也可以只要求对已有页面截图和验收。安装后的插件副本与此源码目录独立，修改源码后需更新分发副本并重新安装插件。

手动安装步骤见 [INSTALL.md](./INSTALL.md)。`python3 scripts/prepare-personal-plugin.py` 只准备个人插件副本和列表条目，安装由用户自行执行输出的 Codex 命令。

### ZIP 本地分发

运行 `python3 scripts/package-plugin.py` 生成带本地 marketplace 和安装脚本的 ZIP；把 ZIP 发给他人即可。接收者解压后执行 `python3 install.py`，不依赖作者机器或 Codex 内置 plugin-creator。运行前可用 `--dry-run` 查看安装命令。详情见 [分发说明](./distribution/README.md)。

# Web 平台

## Web 实现与验收

同一页面需要尝试多组局部 CSS 微调时，优先使用 `variants --variants <项目>/variants.json --compact`（配置见 `cases/variants.example.json`，相对插件根目录）。一次提交有依据的 4–8 组候选，共享浏览器并隔离注入样式，避免逐候选改源码、构建、截图。查看 `ranking.json` 与差异裁片；baseline 最佳时不要写入更差候选，best 为 null 时先排查非视觉检查失败。仅把确认有效的候选写回源码，再做 final；保持 single-image 不透明边界，不通过候选 CSS 重画内部内容。

1. 明确设计有的结构、图片与交互，并按项目规范实现；不添加设计外控件。保留真实可用的交互，未提供领取、支付等业务协议时不编造成功状态，交付时说明未接入部分。
   - 最外层页面壳必须流式自适应：使用 `width: 100%` 或块级元素默认的 `auto`，高度由内容撑开。需要至少铺满首屏时使用 `min-height: 100vh`，可追加 `min-height: 100dvh`；不要把设计稿画板宽高换算成页面壳的固定 `max-width`、`height` 或 `min-height`。确有桌面限宽需求时，把 `max-width` 放到页面壳内部的内容容器。
   - `height: 100%` 不是内容页默认方案。只有 `html/body/#app` 的祖先高度链已由项目建立，并确认不会截断长内容或滚动时才能使用；其余情况使用内容高度或 `min-height`。
   - 页面局部 SCSS 不得新增 `html`、`:root`、`body` 或未作用域的 `*` reset，不得为了 rem 换算设置根字号。先复用项目现有全局样式；确需 `box-sizing` 时限定到页面壳及其后代。页面背景、主题色和设计稿尺寸只写在页面壳或业务组件上。
   - 只有项目确实缺少根尺寸链且页面运行受到影响时，才在模块共享入口补最小初始化，例如 `html, body, #app { width: 100%; min-height: 100%; }` 与 `body { margin: 0; }`。不要在页面文件中夹带根字号、背景色或固定画板尺寸。
2. 启动目标页面。先检查脚本内容，避免把上传、发布等副作用当作本地构建运行。
   - 只启动目标入口，检查构建插件是否仍扫描用户排除的页面。业务运行时与 QA 的 Node 18+ 分开使用；共享 reset/rem 样式保持来源可识别，CSS 检查报错先查来源，不能用 `html` 或 `*` 忽略整棵业务 DOM。
3. 从 [基础用例](../../../cases/example.json) 或 [设计契约用例](../../../cases/contract.example.json) 复制到项目验收目录，替换 URL、节点 ID、设计图、viewport、选择器和等待条件。示例数值不是当前设计要求。设计图与浏览器截图必须使用一致的像素尺寸、DPR、裁切和状态。
   - 页面包含底部 Logo、安全区、Home Indicator、吸底元素或绝对定位装饰时，除标准设计 viewport 外，必须增加一个同宽、较短高度的回归 case；短视口高度按页面风险选择，不写死全局值。该 case 开启 `fullPage`，并用 `contract.relations.gapY` 等关系核对底部元素间距，确认没有覆盖或裁切；使用 `suite` 组合标准与短视口 case。没有底部定位风险的页面不强制增加此用例。
4. 预计会执行两轮及以上截图时，第一次验证前启动一次 `browser-server`，后续 `measure`、`verify` 和 `suite` 都传同一个 `--browser-endpoint`，任务结束后关闭 Server。只执行一次的最终验收无需额外启动 Server。多个 case 优先用 `suite`，它会在未指定 endpoint 时按浏览器通道自动复用 Chrome。
   - 无 endpoint 时，单次 adaptive 自动让候选与 final 共用一个浏览器，各自使用隔离上下文与完整就绪等待；无需为此额外编排两次命令。它不跨 CLI 调用保活，跨轮仍使用 browser-server。
5. 页面生成默认重复执行 `verify --mode adaptive`：首轮完整诊断，后续像素失败立即生成最新局部裁片，候选通过后自动执行 final。收到 `nextAction=inspect-diagnostic-crops` 后一次处理全部差异区域再复验；禁止无修改重跑，也不要把单个 CSS 属性拆成多轮串行试错。不重复读取完整设计图、实际图或 diff。
   - 每轮 Web verify 自动输出 `outputDir/comparison.html`，摘要通过 `html` 给出路径，展示设计 / 实现 / 差异、状态、模式与耗时，无需手写对比页。失败结果照常展示，只有 final + passed 标记最终验收通过；旧文件不能充当新一轮执行失败后的证据。
   - 用户限制源码范围或单页无需代码缓存时加 `--skip-code-scan`，并把 `--cache` 指向 case 专属目录；这会禁用验证结果复用，设计/素材缓存不受影响。需要 changed-only 时不使用此选项，且先确认其扫描范围获准。
6. case 使用 `intentPlan` 引用 `intent-plan --strict` 的输出；明确图片意图由计划自动生成并强制执行 `single-image` 结构校验，不手写一套可能冲突的图片规则。标题整图、卡片整图等 selector 必须只匹配一张图片且没有可见子元素；保留 CSS 规则检查。`preferResponsivePage` 会拒绝页面壳上的固定绝对长度（包括 `px/rem/em`）宽高与最小/最大宽高；页面样式表修改 `html` 根字号或背景也会失败，未作用域 `*` 会报告 warning。不能为过关放宽阈值、替换基准或屏蔽业务区域。只复用确实未变化的设计和素材缓存。
7. `adaptive` 只有自动 final 通过才返回 `nextAction=complete`。手工选择模式时仍须最终执行 `verify --mode final`，检查图片加载、字体、布局稳定性、控制台、结构和视觉差异。通过后报告结果与路径；失败或工具不可用时明确未通过及原因。

命令示例（将占位路径替换为实际绝对路径）：

```bash
node "<插件根目录>/scripts/run.mjs" browser-server --browser-channel chrome
node "<插件根目录>/scripts/run.mjs" verify --case "<项目>/visual-qa/case.json" --mode adaptive --skip-code-scan --cache "<项目>/visual-qa/cache.json" --browser-endpoint "<上一步输出的 endpoint>"
```

默认使用本机 Chrome；用户指定其他受支持浏览器时遵从选择。浏览器无法启动时按环境要求处理权限，不用 HTTP 健康检查代替截图。交付包含预览地址、实现位置、验收指标和证据路径，以及跳过的 MCP 或未接入的业务功能。不要自动发布或安装其它插件。

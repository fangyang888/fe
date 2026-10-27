# Visual QA LangGraph

这是 `fe` 仓库中的独立 Python + LangGraph 视觉验收实现。浏览器截图由 Playwright Python 完成，像素差异由 Python pixelmatch 计算，SSIM 在本项目内按旧 `ssim.js fast` 的整数灰度和高斯窗口语义实现；红框检测、Pixso 分批读取、CSS/DOM/设计测量检查也在本项目内完成。运行、测试和示例均不再依赖旧 `visual-qa/` 目录、其 CLI 或 npm 构建。模型修正是可选的；设计、源码准备并行，修正后会重新准备上下文并重新验收。

```text
load_case / 项目 skill 策略 → 红框图片意图 → preparation 子图（Pixso/设计 与 源码并行）
          → 将 3x 图片绑定到 HTML 对应 DOM
          → qa 子图（真实验收 → 精简区域修正包）
          → record_round
          → 通过：结束
          → 失败且启用模型：diagnose → 受限 apply → preparation → qa
          → 指标明显恶化：rollback → preparation → qa
```

## 安装

需要 Python 3.13+ 和本机 Chrome。在此目录运行：

```sh
uv sync
uv run visual-qa-langgraph --help
```

默认由 Python 直接启动独立的无头 Chrome，无需 Browser Server。若使用 Playwright 的 Chromium，先运行 `uv run python -m playwright install chromium`，并在 case 中设置 `"browserChannel": "chromium"`。无需自行安装 Node.js；Playwright Python 包自带浏览器驱动。DOM 采集通过浏览器内只读 JavaScript 获取，验收规则与图像处理由 Python 执行。

## LangGraph 开发服务与 Studio

在 `visual-qa-langgraph` 目录中启动：

```sh
uv run --with 'langgraph-cli[inmem]' langgraph dev
```

`langgraph.json` 通过 `./dev.py:visual_qa` 加载已有的完整工作流，包含并行 preparation 子图、qa 子图以及修正和回滚分支。`build_graph()` 已经返回编译后的图，不需要再次 `.compile()`；检查点由开发服务管理。环境变量从本目录的 `.env` 加载。

在 Studio 中选择 `visual_qa`，使用 JSON 输入。例如下面的离线输入可直接验证图是否运行，路径相对于启动服务的目录：

```json
{
  "case_path": "examples/pixso-2-179511/case.json",
  "run_dir": "runs/studio-offline",
  "cache_dir": "cache",
  "offline_actual": "examples/pixso-2-179511/design.png",
  "auto_fix": false
}
```

离线示例用设计图自身检查流程，结果为 `offline_review`。要验收真实页面，另开终端在同一目录运行 `python3 -m http.server 4174 --directory examples/pixso-2-179511`，删除输入中的 `offline_actual` 并换一个 `run_dir`。其他输入字段与 `RunState` 一致，例如 `source_paths`、`model_name`、`pixso_endpoint` 和 `pixso_revision`；使用 Pixso 时必须提供 revision，自动修正需同时提供 `model_name`、`auto_fix: true` 和模型 API 凭据。每次独立验收使用新的 Studio thread 和运行目录，避免混用轮次及证据。

开发服务直接运行图节点，结果保存在 Studio 状态及 `run_dir` 的逐轮证据中。CLI 的 `summary.json` 汇总、SQLite 断点恢复和异常事务恢复由 `run_workflow()` 管理；需要这些完整运行保障时，使用 CLI。

### 工作流说明

图示、各节点职责、子图结构，以及自动修正和回滚条件，见 [流程 README](流程README.md)。

## Skill 与插件

面向 Agent 的工作流位于 [visual-qa-langgraph Skill](skills/visual-qa-langgraph/SKILL.md)，插件清单位于 [.codex-plugin/plugin.json](.codex-plugin/plugin.json)。Skill 名称为 `visual-qa-langgraph`，保留旧 `visual-qa` 的显式调用策略，因此使用 `$visual-qa-langgraph` 明确触发，或安装插件后选择 “Visual QA LangGraph”。Web 验收、Pixso/红框图片、SCSS 重构分别按需读取 [web.md](skills/visual-qa-langgraph/references/web.md)、[generation.md](skills/visual-qa-langgraph/references/generation.md) 和 [scss-refactor.md](skills/visual-qa-langgraph/references/scss-refactor.md)。

插件中的命令统一使用 `visual-qa-langgraph`。在本目录打包、安装与管理：

```sh
python3 scripts/package_plugin.py          # 打包到 build/
python3 build/codex-plugin.py install      # 注入 Codex
python3 build/codex-plugin.py update       # 打包新源码后执行更新
python3 build/codex-plugin.py status       # 查看安装状态
python3 build/codex-plugin.py remove       # 卸载插件及其 Codex 缓存
```

管理脚本位于 `build/codex-plugin.py`，支持安装、更新、状态查看、删除及 `--dry-run`。系统具备可用的 make 时，也可以使用 `make build/install/update/status/remove`；其中 `make update` 会先重新打包。完整命令、产物结构和 ZIP 分发方式见 [打包与插件管理](build/README.md)。安装后需要重新打开或刷新 Codex，并用新聊天加载 Skill。源码修改后重新打包再执行更新，内容版本会自动变化。

## 新 Pixso 用例

示例位于 [examples/pixso-2-179511](examples/pixso-2-179511/README.md)，对应 [Pixso 节点 2:179511](https://pixso.cn/app/design/qywt_bYlzqjdJdNrHVnluA?item-id=2:179511&editMode=coder)。已从该节点导出 375 × 106 的设计基准图，完成真实 MCP 读取和浏览器最终验收。

从仓库根目录启动预览：

```sh
python3 -m http.server 4174 --directory visual-qa-langgraph/examples/pixso-2-179511
```

运行完整图（省略 Pixso 参数时直接使用本地设计图）：

```sh
visual-qa-langgraph/.venv/bin/visual-qa-langgraph \
  --case visual-qa-langgraph/examples/pixso-2-179511/case.json \
  --pixso-endpoint http://127.0.0.1:3667/mcp \
  --pixso-revision node-2-179511-2026-10-27 \
  --run-dir visual-qa-langgraph/runs/pixso-2-179511
```

Pixso MCP 读取要求当前 Pixso 桌面应用打开目标设计文件。`--pixso-revision` 是缓存版本键；设计变化时应使用新版本值或加 `--pixso-refresh`。若已有本地设计图与素材，可以省略 Pixso 参数。离线诊断可传 `--offline-actual actual.png`，其状态固定为 `offline_review`，不代表最终验收。

## 红框代表整张图片

在截图中用红框标出图片后，传 `--annotated-image marked.png --image-html path/to/index.html`。图会识别红框、定位 Pixso 节点、直接导出节点的 **3x PNG**，复制到 HTML 同目录的 `assets/images/`，然后替换对应 DOM 的可见子内容。DOM 宽高取导出 PNG 像素宽高除以 3；红框只用于定位，**不作为裁切区域或最终尺寸**。匹配到的节点成为不透明图片边界，后续设计读取不会查询其子层。

页面必须已有唯一的图片占位元素，默认 selector 是 `[data-visual="region-1"]`、`[data-visual="region-2"]` 等。可用 `--image-map map.json` 指定 Pixso 节点与 DOM selector，例如：

```json
{"hints":[{"order":1,"nodeId":"138:97117","selector":"#hero-picture"}]}
```

如果 Pixso 的浅层节点包含可靠坐标，流程会自动匹配近似红框；坐标缺失或候选不唯一时，需在 `--image-map` 中指定 `nodeId`，不会用红框截图裁图冒充节点。截图中设计画板范围不能自动识别时，加 `--annotated-frame x,y,width,height`。当前自动 DOM 修改支持静态 HTML 的 `#id` 和 `[data-visual="..."]` selector；React/Vue 页面可复用导出的资源与意图计划，但组件源码仍需对应框架的写入器。

## 项目 skill 决定 CSS 单位

运行时传 `--project-skill /path/to/project/SKILL.md`。为了让图稳定读取，项目 skill 中放一段明确的配置；其余自然语言说明照常保留：

````md
```visual-qa-langgraph-policy
{"schemaVersion":1,"css":{"unit":"rem","rootFontSizePx":10,"conversion":"authoring"},"layout":{"preferFlex":true}}
```
````

`rootFontSizePx` 是**设计视口下**项目实际使用的根字号，图不会修改 `html` 或 `:root`。`conversion: "authoring"` 表示生成的 CSS 直接写 rem；项目已有构建工具自动把 px 转 rem 时写 `"build"`，此时 scaffold 草稿保留 px，避免重复转换。HTML 内联图片尺寸不会经过构建转换，因此两种 rem 模式都写 rem。项目明确使用 px 时配置 `{"unit":"px","conversion":"none"}`，不需要根字号。

图会在运行目录保存 `project-policy.json`、`scaffold-options.json` 和启用 `cssRules.preferRem` 的 `effective-case.json`，验收读取该有效用例。原始 case 若与 skill 的单位或 Flex 规则冲突会直接报错。没有传项目 skill 时沿用原有 case，不猜测换算比例。`scaffold-options.json` 保存生成代码时需要的单位约定，修正模型也会收到这些约定。当前图不会自动生成或覆盖整页 scaffold。

## 自动修正与缓存

传入 `--model <OpenAI 模型名> --auto-fix` 后，失败页面会进入最多两轮修正和重验；可用 `--max-fixes 1..5` 调整。模型只收到最多四个差异区域、每区两个 DOM 候选、选中源码片段与最多两张局部对比图。它返回精确的 `find/replace`，程序只允许修改 `--source` 指定的文件；未指定时，仅允许用例同目录已有的 `index.html`、`styles.css`、`main.js`。每次最多四处修改，必须唯一匹配。若像素差异比上一轮增加超过 0.15 个百分点，会自动还原该轮文件并重新验收。使用 `--auto-fix` 需要模型 API 凭据与真实浏览器验收；本仓库未保存 API 凭据。

修复包还保留字体、图片加载、布局稳定性、控制台、CSS 规则、DOM 结构和设计测量的失败原因。每类最多六条，总计最多 24 条，附总数与省略数量；阻断项优先。项目的 CSS 单位、根字号换算、构建转换模式、Flex 策略和 case 中的 CSS 规则会传给模型，即使像素差异为零，也能诊断其他验收失败。源码提取识别静态 `id`、`class`、JSX `className` 和 `data-visual` 属性及对应 CSS selector，优先分配上下文预算给命中的文件，片段总计不超过 14,000 字符。动态拼接类名和 CSS Modules 的运行时映射仍需人工定位。

修改前会校验源码指纹，并在 `backups/fix-N/transaction.json` 写入事务记录。多文件写入失败或修改后的准备、验收阶段抛异常时，会恢复该次修改；进程被直接终止时，下次启动或恢复会先处理未完成的事务。回滚同时校验备份和当前文件；检测到外部修改、备份损坏或磁盘仍不可写时，会明确报错并保留恢复记录，不覆盖外部修改。新运行归档旧备份前也会先恢复未完成事务。

默认共享缓存位于 `visual-qa-langgraph/cache/`，可用 `--cache-dir` 更改。设计、图片意图、素材与源码按内容哈希复用；Pixso 远端缓存还按显式 revision 分离。浏览器验收每轮重新采集，不复用旧截图。每次运行的 `runs/<名称>/checkpoints.sqlite` 保存 LangGraph 断点；中断后用相同的 `--run-dir --resume` 继续。

恢复必须使用原 case 路径。可以传新的 `--browser-endpoint` 或 `--pixso-endpoint`；`--browser-endpoint` 支持 CDP HTTP 地址、CDP WebSocket 和 Playwright WebSocket。没有端点时直接启动 Chrome。省略的模型、自动修正开关、修正次数上限、缓存目录和项目 skill 等设置沿用检查点。恢复会丢弃未执行的旧修改，重新读取 case、设计、源码和项目策略，刷新指纹并重新验收；原有轮次、已消耗的修正次数与模型用量继续保留。已完成的运行使用 `--resume` 也会重新验收，不直接返回旧的成功结果。Pixso 设计变化时仍需更新 revision 或显式传 `--pixso-refresh`。

```sh
visual-qa-langgraph/.venv/bin/visual-qa-langgraph \
  --case visual-qa-langgraph/examples/pixso-2-179511/case.json \
  --run-dir visual-qa-langgraph/runs/pixso-2-179511 \
  --resume
```

输出包括 `summary.json`（耗时、各轮指标、模型 token）、`rounds.json`、`repair-packet.json`、逐轮截图/报告、模型诊断与代码备份。`modelUsage` 只统计此 Python 图自己发起的模型请求；未使用 `--model` 时为零，不代表 Codex 会话消耗为零。

CLI 退出码：`0` 仅表示 `final passed`；`1` 表示未完成最终验收（包括视觉失败、离线诊断、修改被拒绝或修正次数耗尽）；`2` 表示参数错误或执行异常。正常结果以 JSON 写到 stdout，执行错误以 JSON 写到 stderr；图节点异常还会保存 `status: "error"` 的 `summary.json`，包含错误、回滚结果和耗时，供 CI 与恢复排查使用。

### 耗时统计

每次执行会追加 `timing.jsonl`，并在成功或失败后生成 `timing-summary.json`；`summary.json.timings` 包含同一汇总。`stages` 保留每次修正和重验的调用次数、累计执行时间 `sumMs`、区间并集 `coveredMs`、缓存命中与失败次数。`rounds` 分别汇总准备、验收和修正耗时；`parallelPreparation` 单列设计读取、源码准备、实际墙钟时间及重叠时间，避免把并行任务简单相加。

`activeWallMs` 是各次实际运行时间之和；中断恢复时 `elapsedWallMs` 还包括两次运行之间的停顿。`unattributedMs` 是图调度、检查点、文件写入等未落在节点内的时间。节点失败也会记入日志；恢复时把之前未结束的尝试标为 `interrupted`，不把等待恢复的时间计入 `activeWallMs`。同目录发起全新运行时，旧统计移到 `history/`，新运行单独计时。原有 `totalMs` 保留为本次 CLI 调用耗时。

## 当前验证与范围

2026-10-27 Python 迁移验证：57 项测试全部通过，其中 6 项为真实 Chrome 集成测试；Pixso 2:179511 本地设计示例通过完整 LangGraph 验收，像素差异 **0.4704%**、SSIM **0.996907**。基准套件的两个视口也通过，SSIM 与迁移前旧实现的 `0.982993` 对齐。

迁移前的历史记录（旧指标实现）：2026-10-27 新节点验收结果为 `final passed`，像素差异 **0.4704%**，SSIM **0.9969**。真实 Pixso MCP 读取 12 个布局节点；准备缓存跨运行目录命中，失败后 SQLite 断点恢复成功。自动修改循环用模拟模型响应验证了“修改限定文件→重验”；本机未配置 `OPENAI_API_KEY`，所以未发起真实修正模型请求。

目前支持 Web 单页和由多个 Web case 构成的 suite。Harmony、旧 CLI 的完整 scaffold/插件分发命令、业务按钮行为测试不在当前 Python 实现范围内。每轮都进行完整的 `final` 检查，不复用截图或使用旧 adaptive/quick 状态。已有 `changeDetection` 元数据不会缩小检查范围。

像素差异使用 Python pixelmatch 的 YIQ 阈值与抗锯齿识别；SSIM 使用 `ssim.js fast` 等价的整数灰度、σ=1.5 高斯窗口和总体协方差实现，并在小到无法容纳 11 像素窗口时保持其可容纳的最大奇数窗口语义。报告 `comparison.metrics` 标记算法。默认阈值保持 `0.1 / 1.5% / 0.98`；关键区域使用同一套算法独立判定，图像尺寸不一致直接报错。离线比较也会应用 case 的阈值与关键区域，但只能得到 `offline_review`。

红框自动定位支持独立的矩形边框；截图比例与设计视口不一致时需明确传 `--annotated-frame`，相交或不完整边框需先分开标注。Pixso 会逐层读取直接子节点，已声明图片只保留外部尺寸并整图导出。

回归测试覆盖多文件写入失败、进程被直接终止、备份校验、外部修改保护、重验异常回滚、恢复参数与文件刷新、进程退出码、非像素失败诊断、项目策略传递，以及大文件中的源码定位。模型响应和在线浏览器验收在这些故障测试中使用模拟结果，不代表真实模型的修正成功率。

运行测试：

```sh
visual-qa-langgraph/.venv/bin/python -m unittest discover -s visual-qa-langgraph/tests -v
```

## 独立命令

从仓库根目录运行：

```sh
visual-qa-langgraph/.venv/bin/visual-qa-langgraph doctor --case visual-qa-benchmark/case.json
visual-qa-langgraph/.venv/bin/visual-qa-langgraph verify --case visual-qa-benchmark/case.json --compact
visual-qa-langgraph/.venv/bin/visual-qa-langgraph suite --suite visual-qa-benchmark/suite.json --compact
visual-qa-langgraph/.venv/bin/visual-qa-langgraph capture --url http://127.0.0.1:3000/page --output page.png --width 375 --height 812 --dpr 1 --browser-channel chrome --selector ".page" --compact
visual-qa-langgraph/.venv/bin/visual-qa-langgraph compare --expected design.png --actual actual.png --output diff.png
```

`capture` 使用 Playwright Python 保存独立截图，并执行资源、字体与布局稳定性检查；`--full-page`、`--ready-expression`、`--browser-endpoint`、`--wait-timeout-ms` 和 `--stable-frames` 可按页面需要追加。`verify` 直接验收已有页面，无需提供源码。无子命令的 `--case` 入口运行完整 LangGraph。`doctor` 只校验本地配置与设计文件，不代表浏览器验收通过。`compare` 是离线诊断，退出码固定为 1；`verify`/完整图只有最终通过才返回 0，执行错误返回 2。`suite` 任一 case 执行异常返回 2，视觉不通过返回 1，全通过返回 0。`intent-plan` 子命令可独立生成红框意图计划。

主命令统一为 `visual-qa-langgraph`，原 Python 命令 `visual-qa-graph` 保留兼容别名。已有 `visual-qa-policy` 项目配置块和 `visual-qa-intent-plan` JSON 仍可读取，它们只是数据格式兼容，不会调用旧 CLI。新配置使用 `visual-qa-langgraph-policy`。

真实 Chrome 集成测试（覆盖 CSS、结构、测量、图片加载、DPR/整页截图和模型修改后的重验；模型响应使用模拟数据）：

```sh
cd visual-qa-langgraph
VISUAL_QA_BROWSER_TESTS=1 .venv/bin/python -m unittest discover -s tests -v
```

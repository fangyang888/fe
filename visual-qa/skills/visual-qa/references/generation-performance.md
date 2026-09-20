# 页面生成提速

新建 Pixso Web 页面时使用本流程；纯验收不必补设计读取和代码生成。这里的命令均从目标项目目录执行，`<cli>` 表示 `node "<插件根目录>/scripts/run.mjs"`。输出放在该页面自己的产物目录。保留原有图片边界、项目单位规范和最终验收要求。

## 全流程计时

每次生成使用新的 `timing.jsonl`，在开始读取项目/设计前记录 `run-start`。计时跨越模型生成、MCP 等待、预览启动与修正；不能用一次 CLI 的运行时间冒充端到端耗时。

```sh
<cli> generation-timing --log artifacts/run-1/timing.jsonl --action mark --id run-start
<cli> generation-timing --log artifacts/run-1/timing.jsonl --action start --id design-1 --stage design-read
# 批量读取并整理设计
<cli> generation-timing --log artifacts/run-1/timing.jsonl --action end --id design-1
```

在阶段边界记录，不逐节点打点。阶段使用 `setup`、`design-read`、`asset-export`、`first-code`、`preview-start`、`repair`；同一阶段可有多次尝试，各用独立 id（例如 `repair-1`、`repair-2`）。失败的尝试用 `--action end --status failed` 结束；不能把失败重试耗时丢掉。阶段可重叠，多个工具调用放进同一个批次阶段即可。计时写入有短锁，勿同时修改日志文件。

- 首版页面可运行且 comparison.html 已生成时，`--action mark --id first-preview`。
- 原有 adaptive 返回 complete / final passed 后，`--action mark --id final-verified`；未通过只记录 `run-stopped`，不伪造完成里程碑。
- verify/variants 等 CLI 可附加 `--trace-log artifacts/run-1/timing.jsonl`，自动记录命令开始、结束和失败。保留验收 report.json，里面有更细的 capture/comparison 等 timings。
- 收尾用 `generation-timing --log ... --action summary`。`elapsedMs` 是首末事件的观察时长，包含空档；`milestones` 是距首事件的时长；`stages[].sumMs` 是调用时长之和，`coveredMs` 是该阶段区间并集。并发或嵌套阶段不能相加当总耗时。`openSpans` 非空表示有未结束阶段，先如实处理，不能视作完整计时。

## 批量设计读取

先完成 intent-plan --strict。然后初始化读取状态：

```sh
<cli> design-batch --plan artifacts/intent-plan.json --revision '<设计版本>' --state artifacts/read-state.json --output artifacts/batch.json --batch-size 16
```

`batch.json.batches` 是**传输无关的请求计划**，不是已执行 MCP 的结果。使用当前环境的 Pixso 工具把每个批次的 `nodeIds` 映射为实际节点参数，合并同层查询，按工具当前 schema 传入必要字段和最小浅层深度。计划的 `readDepth: 1` 表示“自身属性 + 直接子节点外框”，不同工具的深度定义需适配，不能盲传造成递归展开。工具不支持多 ID 时，对允许节点做有界并发，建议 4；不创建额外代理。图片导出可与布局读取并行，沿用 export-manifest，图片不得进入 query_nodes。

将成功响应在工具编排层解析成 JSON 数组，保存 `responses.json`。每项是一个实际请求节点：`{guid, ...自身属性, childNode:[直接子节点]}`。只有已确认的叶节点才补 `childNode: []`；截断、未知或请求失败不能伪装成空子树。字符串文本才映射成 nodeText；坐标、字体、布局等按真实字段适配，不猜测语义。不要把 MCP envelope 或 JSX 当节点树。

```sh
<cli> design-batch --plan artifacts/intent-plan.json --revision '<同一设计版本>' --state artifacts/read-state.json --responses artifacts/responses.json --output artifacts/batch.json
```

每次仅提交新成功读取的节点，可以部分提交并重试余下节点。命令保留真实父子与同级顺序，自动合并结果、裁掉图片内部和未请求的深层数据，输出下一批未读节点；已读节点不再请求。不允许未知节点、重复响应或图片节点响应。单个 state 由一个编排者顺序更新，MCP 请求可并发，状态文件写入不可并发。

版本必须来自可靠设计版本标识；若工具不能提供版本，以本次读取的独立 run ID 为 revision，**只在本次任务内复用**。设计发生变化后启用新 state，禁止用任意固定版本跨任务缓存。图片意图或版本变化会拒绝旧状态。

当 `status: ready` 时，`batch.json.context` 就是裁剪后的 generation-context，可以直接保存为 `generation-context.json`，无需再查询或重复运行 generation-context。只有 `read-next-batch` 才继续读取；`needs-review` 按 issues 修复图片/层级问题。只向模型返回 batches、stats、issues 或最终精简 context，别打印 state 和原始响应。

## 确定性代码草稿

Web 使用 `generate-scaffold` 把 ready context 转为保持层级的 HTML 片段、CSS 和资产绑定清单，减少重复手写图片标签、尺寸、单位和基础 Flex。它不生成业务逻辑或完整项目，也不转换为 ArkUI。

`scaffold-options.json` 示例（nodeId 替换成实际节点）：

```json
{
  "unit": "rem",
  "rootFontSize": 10,
  "assets": {
    "138:42098": { "src": "./assets/hero.png", "alt": "" }
  },
  "selectors": {
    "container-id": "#card"
  },
  "layout": {
    "container-id": { "mode": "column" },
    "overlay-id": { "mode": "absolute", "left": 12, "top": 20 }
  }
}
```

`unit` 来自目标项目，rem 必须明确提供项目 rootFontSize，生成器不修改全局根字号。没有需要覆盖的节点时，省略 selectors/layout。`assets.src` 是合入业务页面后可用的本地 URL；不下载/复制素材、不验证文件或像素边界，继续使用原有导出校验。图片必须明确给出 alt（装饰图片可为空）；缺失素材输出同尺寸无修饰 div 占位和待处理项，最终结构验收仍会拦截。

```sh
<cli> generate-scaffold --context artifacts/generation-context.json --config artifacts/scaffold-options.json --output artifacts/scaffold-1 --trace-log artifacts/run-1/timing.jsonl
```

输出目录必须不存在，避免覆盖人工修改。产物为 `fragment.html`、`styles.css`、`scaffold.json`，始终标为 draft。将 HTML/CSS 合入用户指定页面，按现有框架转换模板属性和素材引用，不创建替代项目；Vue/React 的模板转义与事件由集成步骤处理，HTML 文本不得直接解释成框架表达式。

- 仅自动映射确认的 HORIZONTAL/VERTICAL Flex、尺寸、间距（margin）、padding、字号等基础属性；unsupported 样式列入 issues，由模型集中补齐。
- 根容器保持 width:100%，不写死整页高度。布局仍需按项目要求完成响应式。
- 不将 Pixso x/y 自动当局部绝对坐标；显式 `absolute` 必须给出相对已确认父容器的 left/top。裁切、叠放和变换按设计补全。
- 图片节点保留单个 img，不生成内部 DOM。selector 自动绑定仅支持单个 #id、.class、data 属性；复杂 selector 应人工集成，不能改弱 intent 以迁就生成器。分层图片的组合容器需在 selectors 中绑定原 groupSelector。
- 首版集中处理 scaffold.json.issues，完成素材/布局/文本样式/交互后立即 adaptive。修正阶段继续记录每轮 repair；最终验收规则保持不变。

衡量收益时，使用同类页面对比 first-preview、final-verified、MCP 请求数与 repair 轮次；不能把理论批次数减少写成已测得的端到端提速。

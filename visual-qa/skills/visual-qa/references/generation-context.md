# 生成前图片边界检查

这是设计输入处理，不依赖页面、开发服务、case 或截图。`verify` 的图片结构检查仍是最后一道防线，不能代替这里的前置流程。

1. 从用户原文锁定图片 item-id 与 selector，生成 `intent-plan --strict`。红框没有 item-id 时，只通过浅层外部布局确认边界并绑定节点；不能进入图片内部寻找替代图层。节点不在目标画板、父子图片声明重叠等问题应先澄清，不能自行更换设计页面。
2. 读取目标画板的浅层布局：新建 Web 页面优先使用 [design-batch](generation-performance.md) 合并同层请求、记录已读状态并生成后续批次。`query_nodes` 使用最小 `readDepth` 和按需 `fields`，从非图片容器逐层补齐必要结构。对图片节点不直接 query、不展开。独立图片导出可与布局读取并行。保存结构化数据，不先调用整页 `design_to_code`。
3. design-batch 已返回 ready context 时直接复用；手头已有完整结构化节点数据时执行：

   ```sh
   node "<插件根目录>/scripts/run.mjs" generation-context --plan intent-plan.json --nodes pixso-nodes.json --output generation-context.json
   ```

   输入是一个 Pixso 根节点、`[根节点]` 或 `{ "nodes": [根节点] }`。节点 ID 用 `guid`，子节点用 `childNode` 数组；必须保留工具返回的真实父子关系。MCP 的 `content[].text` 外壳先在工具编排层解析，不直接打印完整响应。不能把不同节点查询结果并列成伪造画板，不能用生成 JSX/CSS 代替节点数据。若接口格式不同，适配真实字段；不猜测层级或强行标记通过。
4. CLI 命中图片 ID 后立即终止递归，只保留身份、selector、外框和外部层级信息；Pixso 类型、内部文字、样式和后代不进入生成上下文。`hierarchy` 保留真实父节点、祖先链和原始同级索引；`tree.children` 不按图片声明顺序重排。保留父容器的定位、裁切、透明度及源数据提供的叠放信息，不能把图片列表当作同级布局。原始同级索引不是可直接照抄的 CSS z-index，前后方向按 Pixso 语义/视觉依据确认。只有 `status: ready`（退出码 0）才开始实现。缺少节点、selector 或画板不匹配会退出 1，并清空代码生成白名单。修复缺失信息时只补浅层布局，不扫描图片内部。
5. 实现只消费裁剪后的 `generation-context.json`。`codeGeneration.allowedNodeIds` 是 `design_to_code`/`get_node_dsl` 的允许入口：包含图片的容器由外部布局数据实现，图片及其祖先不可作为代码生成入口；未知节点不默认放行。未列出的节点不能通过空 guids/当前选中节点绕过限制。没有图片意图时仍可生成整页参考代码。
6. 已明确的 `layers` 组合保留布局容器，每个 `base-image` / `overlay-image` 各自成为不透明图片；上下层角色保留在资产索引中，真实父子及顺序仍以树为准，不把整个组合压成一张图。组合 selector 指向容器，各层页面 selector 在原有 composite-image 结构用例中配置。不可仅凭视觉相交，把用户指定的单张整图自动改为 layers。
7. 先把图片绑定到本地整图资产，再写非图片布局。导出失败保留等尺寸、无视觉修饰的占位，继续其余区域并报告缺失；绝不降级为重画图片内部。图片内的文字/阴影随整图保留，图片外的兄弟文字/控件仍独立实现。资源来源和最终 DOM 结构继续由原有 manifest/verify 流程核对。

此命令负责裁剪输入和生成允许列表，不是 Pixso MCP 代理，不能拦截绕过流程的外部工具调用。不要声称仅运行命令就已验证导出资产或页面。设计或图片意图变化后必须重新生成上下文。

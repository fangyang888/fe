# 设计与图片流程

## 输入来源

优先使用用户提供的 Pixso 文件、设计版本和本地设计图。需要远端读取时，确认 Pixso MCP endpoint、目标文件已在 Pixso 中打开，并提供稳定 revision。MCP 不可用时使用已有设计 PNG 和素材继续，不猜测设计，也不宣称读取成功。

Python 图通过 `query_nodes` 的 `readDepth: 1` 分批读取非图片节点，通过 `get_export_image` 导出图片。它不再调用旧 `design-batch`、`generation-context`、`export-manifest` 或 `generate-scaffold`。不要在流程外重复发明这些中间命令。

Pixso MCP 读取要求 case 中有 ready `intentPlan`。没有图片意图时，可使用已导出的设计图和本地素材完成实现与验收；只有用户给出红框、已有 intent plan 或明确节点映射时才读取设计树。

## 红框和单图

红框只定位整张图片，不表示裁切区域或 CSS 尺寸。先确保页面有唯一占位元素，默认 selector 为 `[data-visual="region-1"]`、`[data-visual="region-2"]` 等。无法自动匹配节点时提供 image map：

```json
{
  "hints": [
    {
      "order": 1,
      "nodeId": "138:97117",
      "selector": "#hero-picture"
    }
  ]
}
```

独立生成 intent plan：

```sh
<qa> intent-plan \
  --annotated <marked.png> \
  --node-id <Pixso-中精确 ID> \
  --width 375 \
  --height 812 \
  --frame x,y,width,height \
  --intent <image-map.json> \
  --output <项目>/artifacts/visual-qa-langgraph/intent-plan.json
```

`--frame` 只在设计画板边界无法自动识别时提供。复杂 selector 或其他框架源码可能无法自动绑定；资源导出和 intent plan 仍可复用，但页面集成需要按目标框架完成。

### 大框底图与内层小图

大框是独立的**底图节点**，内层小框各是独立图片节点。不要把包含所有子层的 Pixso 组合节点导出为底图，否则叠加小图会重影。每个红框只导出对应节点一次；意图计划中的 `parentRegionId` 表示视觉包含关系，不表示应把子图烘焙进父图。

互不接触的嵌套红框会自动保留为父子图片。共边或相连的红框无法仅靠连通区域可靠拆开；工具会报出歧义，要求用 `--image-map` 明确每个图片节点与截图中的红框边界：

```json
{
  "regions": [
    {
      "name": "white-base",
      "nodeId": "138:49973",
      "selector": "#white-base",
      "annotationBounds": { "x": 12, "y": 77, "width": 234, "height": 342 }
    },
    {
      "name": "card-art",
      "nodeId": "138:105510",
      "selector": "#card-art",
      "annotationBounds": { "x": 12, "y": 173, "width": 234, "height": 129 }
    }
  ]
}
```

`annotationBounds` 是标注截图中的整数像素坐标，只用于识别和建立父子关系；导出尺寸以 Pixso 节点实际 3× 图片为准。显式 `regions` 与按检测顺序填写的 `hints` 不能混用。需要把标注截图里所有要导出的图片逐一列入 `regions`。

静态 HTML 绑定允许子图片占位元素嵌套在底图容器内：底图作为容器的 `background-image`，子图保留独立元素。父子图片在视觉验收中按组合图检查叠放顺序，叶子图片仍须是单独的图片元素或背景图。React 等非静态入口需依照同一个 intent plan 手动集成，并保留图片内按钮的真实交互热区。

完整图处理红框：

```sh
<qa> \
  --case <case.json> \
  --source <允许修改的源码> \
  --annotated-image <marked.png> \
  --image-map <image-map.json> \
  --image-html <静态 HTML 占位页> \
  --pixso-endpoint <endpoint> \
  --pixso-revision <revision> \
  --run-dir <项目>/artifacts/visual-qa-langgraph/runs/image-binding
```

`--image-html` 仅支持完成元素级绑定的静态 HTML `#id` 或 `[data-visual="..."]` selector。导出图片固定按 3x 像素尺寸换算 CSS 尺寸。图片节点是不透明边界：不要查询、生成或重画图片内部文字、阴影和装饰；父级容器仍按设计树保留。

组合图片的每一层保持独立图片，以原始父子关系、同级顺序、定位、裁切和叠放为依据。不要用整页截图冒充页面，也不要为了视觉通过把独立文字吞进背景。

## CSS 策略

只有目标项目明确声明单位时才提供策略。项目自己的 Skill 中放一个策略块：

````md
```visual-qa-langgraph-policy
{"schemaVersion":1,"css":{"unit":"rem","rootFontSizePx":10,"conversion":"authoring"},"layout":{"preferFlex":true}}
```
````

`rootFontSizePx` 是设计视口下项目实际使用的根字号。`conversion: "authoring"` 表示手写 CSS 直接使用 rem；项目构建工具自动转换 px 时使用 `"build"`，草稿保留 px。明确使用 px 时配置 `{"unit":"px","conversion":"none"}`。

通过 `--project-skill <项目>/SKILL.md` 传给完整图。图会保存 `project-policy.json`、`scaffold-options.json` 和 `effective-case.json`。不要为了让检查通过而修改项目全局根字号、主题或无关 scope。

## 实现顺序

先保留真实页面结构、交互和项目框架，再绑定图片与非图片布局。复用项目已有组件前核对 Props、导入方式、依赖和视觉适配；组件命中不能替代图片边界或最终验收。

完整图不能替你完成整页业务代码。实现第一版后运行 final 验收；失败时使用报告中受限的差异区域和源码片段修正。启用 `--auto-fix` 时，修改仍限定在显式 `--source` 文件内，并遵守事务备份、回滚和最多修正次数。

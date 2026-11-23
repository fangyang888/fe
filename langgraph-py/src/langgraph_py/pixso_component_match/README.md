# 从 Pixso 设计稿匹配组件库

给定一个 Pixso 页面和项目实际使用的组件库版本，输出一份前端可以逐项核对的选型报告。每个区域回答三个问题：设计稿里看到了什么，库里的哪个组件能实现，对应版本的哪段声明、文档或用例能证明。流程自动生成通过原文核验的区域推荐，运行细节可在 Studio 查看。

## 运行组件入库

从仓库根目录运行。把示例中的目录替换成本机路径。该命令使用项目的 Python 环境，uv 会按项目锁文件安装 LangGraph、PyMilvus、Milvus Lite 和 embedding 依赖。解析 JS/TS 包还需要 Node.js 和 TypeScript（可用 PATH 中的 `tsc` 或输入目录安装的 TypeScript）。只读 Markdown/MDX 文档时无需 TypeScript。

```bash
uv run python -m langgraph_py.pixso_component_match.ingest "/path/to/component-library"
```

终端会显示当前阶段、已处理条数及复用条数。进度写入标准错误，标准输出保留最终 JSON 报告。命令行入库默认关闭 LangSmith 追踪，需要时加 `--trace`。按 Ctrl+C 后可重新运行原命令，继续核对并补齐记录。

源码、文档、图例分开放时，可以分别指定。默认用仓库配置的聊天模型读取图例，也可以显式指定其他支持图像输入的 OpenAI 兼容模型。

```bash
uv run python -m langgraph_py.pixso_component_match.ingest "/path/to/component-library" \
  --docs "/path/to/component-docs" --images "/path/to/component-images" \
  --vision-model "your-vision-model"
```

- **组件来源**：优先传单个包目录，包括已安装的 `node_modules/@scope/ui`。解析器从公开 JS/TS 入口跟踪 PascalCase 值导出和声明里引用的 Props。无包清单的源码目录可按 PascalCase 的 TSX/JSX 文件入口发现组件。只有文档时，按组件页文件名或一级标题识别。通配符子路径、Vue 单文件组件和仅有在线站点的文档尚需相应适配。
- **组件 README**：自动收集组件目录中的 `README.md` 或 `README.mdx`，包括同时指定 `--docs` 的情况。例如 `src/badge/README.md` 的章节进入 Badge 的检索摘要，正文按章节保存。遇到 `<code src='./demos/demo-dot' />` 会读取对应的本地 JS/TS/JSX/TSX 示例，同时记录示例源码行号和 README 的引用行。报告中的 `readme_files` 是实际收集的 README 文件数。
- **图例关联**：支持本地 PNG、JPEG、WebP。优先读取 README/Markdown/MDX 的行内图片及说明。自动递归收集组件自己的 `images/` 下的所有参考图（例如 `src/button/images/primary.png`、`src/button/images/variants/plain.png`），文件名可自由命名。独立图例也可用组件名命名，或放在能唯一对应组件的目录下。`--images` 可以和组件自己的 `images/` 一起用。每个组件按图片内容去重，同图保留可用的文档说明。使用 `--no-vision` 时仍保存图例及快照，供匹配阶段读取。视觉描述以图片内容和模型为键缓存。
- **模型与存储**：脚本读取仓库根目录的 `.env`。文本 embedding 沿用 `EDU_EMBED_BASE_URL`、`EDU_EMBED_MODEL`、`EDU_EMBED_API_KEY`。视觉模型名优先读取 `COMPONENT_VISION_MODEL`，缺省沿用 `OPENAI_DEFAULT_MODEL`，地址与密钥可用 `COMPONENT_VISION_BASE_URL`、`COMPONENT_VISION_API_KEY`，缺省沿用聊天服务配置。Milvus 地址按 `--uri`、`COMPONENT_MILVUS_URI`、`EDU_MILVUS_URI` 的顺序选择，未配置时在输出目录建立本地库。
- **结果**：默认输出到仓库的 `.component-index/`，可用 `--output` 改位置。报告列出组件数、证据片段数、关联图片数、记录总数、跳过原因和从 Milvus 回读核对过的样例。构建清单保存原始路径、行号、原文和快照引用。重复导入会复用同一构建的记录，所有记录与快照校验通过后才更新活动清单。
- **后续检索**：读取 `active/` 清单取得 `collection` 与 `build_id`，加载集合。查询时固定构建，用 `mode == "text_image"` 搜索含图例说明的摘要，或用 `mode == "text"` 搜索相同变体的文本摘要。按 `component_id` 和 `mode == "evidence"` 回查证据。Milvus 的 `ref` 对应构建清单中该组件的证据或图例序号。

## 运行 Pixso 查询

在 Pixso 桌面端打开设计文件，选中画板或组件。复制客户端显示的 **MCP 服务地址**。从仓库根目录运行下面的命令，把地址换成自己的即可。示例端口仅用于演示。[Pixso 本地 MCP 说明](https://pixso.net/developer/zh/mcp/local-mcp.html)

```bash
uv run python -m langgraph_py.pixso_component_match.match --mcp-url 'http://127.0.0.1:3667/mcp'
```

MCP 默认地址为 `http://127.0.0.1:3667/mcp`，可在仓库的 `.env` 中用 `PIXSO_MCP_URL` 覆盖。若要查询特定设计节点，把带 `item-id` 的**图层链接**作为位置参数传入。下面的命令将结果另存为 JSON。

```bash
uv run python -m langgraph_py.pixso_component_match.match \
  'https://pixso.cn/app/design/FILE_KEY?item-id=1%3A2' \
  --report .component-index/pixso-candidates.json
```

程序通过 MCP 握手和工具列表读取 `get_node_dsl` 或 `getNodeDSL` 的参数定义，支持 Streamable HTTP 和 SSE。服务端支持选区读取时，可只传服务地址。若服务端要求额外字段，可用 `--tool-args '{"字段":"值"}'`。对于明确标记为未展开且有 ID 的图层，会尝试按节点补读，每次查询最多补读 12 个；仍有缺口的图层列在分区节点的 `notes` 中。[Pixso DSL 工具说明](https://pixso.net/developer/zh/mcp/tools.html)

桌面端的紧凑 DSL 从 `roots` 读取，完整 DSL 从 `pixTreeNodes` 和 `childNode` 读取。提供带 `item-id` 的链接时，查询会核对响应中的图层 ID；如果根节点或子树都找不到该 ID，先激活对应 Pixso 文件，再从 `read_pixso` 重新运行。

**回放 JSON** 时，给 `--json` 传导出的图层树，或上次运行对应读取节点里 `snapshot` 对应的文件。MCP 响应保存在索引目录的 `designs/` 下。回放会重新分区、检索，仍需 embedding 服务。

```bash
uv run python -m langgraph_py.pixso_component_match.match \
  --json /path/to/design.json --structure-only --top-k 3
```

## 运行 Figma 查询

打开目标文件并启用 Figma 桌面 MCP。运行时默认连接 `http://127.0.0.1:3845/mcp`，也可通过 `FIGMA_MCP_URL` 或 CLI 的 `--mcp-url` 指定地址。桌面版按当前文件中的节点 ID 读取图层，请保持链接对应的文件处于活动状态。[Figma 桌面 MCP 设置](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)

```bash
uv run python -m langgraph_py.pixso_component_match.match --type figma \
  'https://www.figma.com/design/EeMX4Dd7H6pVo9hOKB2TMH/?node-id=23-2&m=dev'
```

流程将链接中的 `23-2` 转成 MCP 节点 ID `23:2`，通过 `get_metadata` 读取 XML 层级、名称和几何位置。文本层仅返回图层名称时，保留其名称作为设计依据。检索和凭证核验复用同一组件库，报告使用 Figma 子图层链接与 `get_screenshot` 返回的截图。

## 在 LangSmith Studio 查看匹配结果

在仓库根目录启动本机服务，打开终端输出的 Studio 地址，选择 `pixso_component_match`，新建 thread 并运行。使用已有的模型和 LangSmith 环境配置。

```bash
uv run --env-file .env langgraph dev --config langgraph.pixso.json --host 127.0.0.1 --port 2024 --no-browser
```

```json
{
  "design_url": "https://pixso.cn/app/design/vYyD5feG2E_yznczt7VCRg?item-id=88:328514"
}
```

| 节点 | 在 Studio 中可以检查什么 |
| --- | --- |
| route_design · 判断设计稿类型 | 检查输入并固定组件库构建，按 `type` 选择读取分支。省略类型时根据链接识别。|
| read_pixso · 读取 Pixso 设计稿 | 通过 Pixso MCP 读取图层树并保存设计快照。|
| read_figma · 读取 Figma 设计稿 | 通过 Figma MCP 读取节点元数据并保存设计快照。|
| partition_regions · 拆分区域与嵌套控件 | 每个区域的节点、可见文案与检索描述。优先识别具备标题与返回图标的导航容器。对于缺少命名的容器，也参考顶部位置和宽高。递归检查可见子树中的实例和具名控件，分别为容器和内部控件建立区域。超过 180 个可见节点时同样执行嵌套识别。|
| retrieve_components · 检索候选组件 | 按库、版本、构建和摘要模式过滤后执行 Milvus COSINE 检索。导航区域额外召回 Nav、NavBar 等导出名，并保留语义候选。|
| verify_evidence · 核验组件推荐依据 | 最多同时核验三个区域。先核对设计图层及组件库原文。有参考图的候选还会抓取对应节点截图，用视觉模型分批对比该版本的参考图。|
| save_report · 保存报告与区域截图 | 自动保存通过核验的匹配。在线查询按图层获取截图，截图不可用时仍可通过设计链接定位。|

最后的 `report.matches` 每项包含区域名称、图层 ID、图层链接、组件和导入路径、版本、推荐理由与可追溯的文档或代码行号。没有通过核验的匹配时返回空数组。Markdown、JSON 及可用的区域截图保存在 `.component-index/reports/`。中间候选可在 Studio 的检索节点评估。CLI 加 `--trace` 可将同一流程发送到 LangSmith。

对比以节点本身的轮廓、背景覆盖、图标和文字排列为准，允许文案、颜色和缩放变化。任一参考变体相符即可通过；所有参考图明确不符时拒绝该候选，截图、快照或模型结果不足时记录证据不足。两种情况均可继续核验其他候选。使用 `--json` 回放或 `--no-screenshots` 时，带参考图的候选会记录视觉证据不足。没有入库参考图的组件沿用原有核验流程。JSON 的 `visual_checks` 保存对比结果、参考图和判断依据。新增图片后需要重新运行入库。

默认查询已入库的活动组件库。对已同时入库的发布包和包内源码目录，优先使用发布包的导出。使用 `--library` 限定项目允许使用的包，使用 `--release` 固定版本。Studio 中 `design_url` 必填；可选的 `type` 可取 `figma` 或 `pixso`，省略时按链接自动识别。选择 `--mode text` 可与默认的 `text_image` 摘要对照。CLI 可用 `--no-screenshots` 关闭截图。

### 嵌套组件

例如“添加亲友”弹窗同时匹配底部面板 `ActionSheet` 和面板内的“确认开启” `Button`。返回的 `parent_region_id` 指向上一级区域，每个匹配各自保留凭证及可用的图层链接和截图。重复控件复用相同输入的检索和核验结果，每个实例仍定位到自己的设计图层。

### 家庭会员管理页的顶部导航栏

“家庭会员管理”标题和左侧返回箭头属于同一条通顶导航。检索会将两个设计事实一起传给核验节点。已入库的 `@meetyou/react-my` 提供 `NavBar`，其 Props 声明由 `children` 提供导航标题，README 的基本用法说明了单箭头返回。两项都取得原文引文时，报告展示该导航区域、所选组件及对应截图。[设计图层](https://pixso.cn/app/design/vYyD5feG2E_yznczt7VCRg?item-id=88%3A332141)

## 2. 第三方包和文档如何入库

两种入口都生成同一种组件目录。目录主键由库、版本或快照、公开导入路径及导出名组成。相同显示名可能对应不同导出，只有确认身份后才归并材料。

| 手上有什么 | 如何识别组件和提取材料 | 报告如何定位原文 |
| --- | --- | --- |
| npm 包 | 从锁文件确定实际版本，解包后沿公开入口及再导出追踪组件；解析类型声明、注释、随包 README 和示例。有可读源码时补充实现片段。 | 包名和版本、相对文件路径、符号和快照行号；有对应仓库提交时附固定链接 |
| 仅有组件文档 | 按组件页和标题层级提取概述、API 表、用例及限制；代码块连同标题和解释保存。优先用文档给出的导入语句识别组件。 | 页面 URL、标题锚点、原文片段和快照哈希；未标版本的页面使用独立快照 ID |
| 两者都有 | 以包的公开导出关联同版本文档；类型声明核对 API 名和类型，用例核对使用方式。 | 同时保留两种出处；版本对应不清或声明有冲突时跳过推荐 |

只有压缩产物且缺少声明或文档时，仍可登记已确认的导出，但把具体能力记为「缺材料」。仅有文档时，可以给出「文档支持」的结论，并标明已核对的文档版本或快照。

### 以组件为父记录，以一项可验证的用途为切片

| 片段类型 | 切分边界 | 分页组件的例子 |
| --- | --- | --- |
| `overview` | 一个组件一条概述，包含用途、适用场景和名称别名 | Pagination / 分页 / 页码导航 |
| `api` | 按一项能力聚合同组 Props、事件、类型、默认值及约束 | 每页条数选择开关、可选条数及变更回调 |
| `example` | 一个完整用例，保留标题、说明、导入和关键调用 | 切换页码后更新受控状态 |
| `constraint` | 一条限制、弃用说明或互斥关系 | 某个展示模式下禁用条数选择 |

短组件按实际材料生成片段。过长的 API 表按功能组拆，并重复表头和组件名；长用例按独立子例或语法块拆，每段保存父用例引用。不要把属性名和说明切开。可先以每片 300–700 token 为整理目标，完整的小用例可以单独成片，原文快照始终保留。

写入 embedding 的文本用「组件名与别名 + 片段用途 + 能力描述 + 原始 API 关键词」。例如 `Pagination 分页｜每页条数选择｜showSizeChanger、pageSizeOptions`。模型可以补中文同义词用于召回；原文和出处另存，核验时只引用能在快照中定位的内容。

### 复用本仓库的 embedding

现有脚本用 `OpenAILikeEmbedding` 读取 `EDU_EMBED_BASE_URL`、`EDU_EMBED_MODEL`、`EDU_EMBED_API_KEY`。索引用 `get_text_embedding_batch(texts)`，逐区域检索用 `get_query_embedding(query)`。沿用脚本对返回维度的检测，以及由地址、模型、`EDU_EMBED_VERSION` 和维度生成的指纹。聊天模型负责区域归纳和候选解释。[仓库 embedding 示例](../../../projects/rag_learning/llama/milvus_course/embedding_search.py)

组件集合单独建为 `component_chunks_<模型指纹>`。可沿用现有 `connect()` 和 COSINE 索引写法，组件字段按下表重新定义。课程示例通过 `uv --with` 引入 PyMilvus 和 embedding 集成包，实施时要将这两项纳入该流程的运行环境。[Milvus 连接与建表](../../../projects/rag_learning/llama/milvus_course/milvus_basics.py) · [课程运行环境](../../../projects/rag_learning/llama/milvus_course/02_EMBEDDING_SEARCH.md)

| 字段 | 写入内容与用途 |
| --- | --- |
| `id`（VARCHAR 主键）、`component_id`（VARCHAR） | 片段 ID 取构建、组件、源文件和片段锚点的稳定哈希；组件 ID 用于聚合和回查 |
| `library`、`release`、`build_id`（VARCHAR） | 目标包、确切版本或文档快照、本次完整索引构建 |
| `framework`、`platform`、`kind`（VARCHAR） | 有依据的适配信息、片段类型；未识别的适配信息写为 unknown |
| `dense`（FLOAT_VECTOR）、`text`（VARCHAR） | 文本向量、实际送入 embedding 的检索文本 |
| `source_ref`（VARCHAR） | 指向快照清单中的证据记录，可解析出来源类型、地址、符号或章节、行段、原文及哈希 |

在新 `build_id` 下按稳定主键 upsert，检查片段数、向量维度以及引用能否回读，再原子切换清单中该版本的活动构建指针。失败时沿用上一构建；本次查询开始即固定构建 ID，核验过程沿用该构建。升级模型时重新向量化；仅资料更新时可按模型指纹与检索文本哈希复用未变的向量。[仓库的构建可见性示例](../../../projects/rag_learning/llama/milvus_course/version_visibility.py)

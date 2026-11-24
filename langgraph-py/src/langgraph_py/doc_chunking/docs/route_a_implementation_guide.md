# 路线 A 实战开发手册：从 0 到 1 实现结构化与精细化文档切片

> **目标读者**：刚接触 RAG / Python 工程的新手  
> **配套架构文档**：[structured_document_chunking_design.md](./structured_document_chunking_design.md)  
> **最终效果**：输入任意包含多级标题、正文、长代码、大表格、图片的 Markdown 文档，一键跑出结构清晰的 `documents.json`（父子逻辑文档）和 `chunks.json`（全模态精细切片）。

---

## 一、动手前必读：路线 A 用到的 4 个核心库与 API 速成

在路线 A 中，你只需要认识 **4 个 Python 工具库**（而且这 4 个库**都已经在你的项目 `.venv` 里装好了**，不用额外折腾安装！）。

### 1. `pydantic`（定义数据结构 + 自动防错 + 一键导 JSON）

- **它是干嘛的？**  
  普通 Python 字典（`dict`）很容易把键名拼错（比如把 `parent_id` 写成 `parnet_id`），程序半天不报错，排查到崩溃。`pydantic` 让我们用类的形式明确声明“有哪些字段、每个字段是什么类型”，出错立刻拦截，还能一键转成 JSON。
- **我们最常用的 4 个 API**：
  1. `BaseModel`：所有数据模型继承它。
  2. `Field(default=..., ge=0, description=...)`：给字段加默认值、数值范围校验和中文说明。
  3. `@model_validator(mode="after")`：校验多个字段之间的逻辑关系（比如 `overlap` 必须小于 `max_tokens`）。
  4. `obj.model_dump_json(indent=2)`：把对象一键变成带缩进的 JSON 字符串。

```python
from pydantic import BaseModel, Field

class DemoChunk(BaseModel):
    chunk_id: str
    token_count: int = Field(ge=0, description="必须大于等于 0")

c = DemoChunk(chunk_id="c1", token_count=120)
print(c.model_dump_json(indent=2))  # 直接打印漂亮的 JSON
```

---

### 2. `tiktoken`（精确计算 Token 数量）

- **它是干嘛的？**  
  Embedding 模型和 LLM 限制的是 **Token 数**而不是 `len(text)` 字符数。中文 1 个字大概占 1~2 个 token，英文 1 个词大概 1 个 token，直接按字数切很容易算偏。
- **我们最常用的 3 个 API**：
  1. `tiktoken.get_encoding("cl100k_base")`：获取通用分词编码器。
  2. `enc.encode(text, disallowed_special=())`：把字符串转成整数 token ID 列表，`len(...)` 就是精确的 token 数。
  3. `enc.decode(token_ids)`：把截取后的 token ID 列表还原回字符串（用来精准截取前 N 个或后 N 个 token 做 overlap）。

```python
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")
tokens = enc.encode("产品手册 / 安装指南", disallowed_special=())
print("Token 数量:", len(tokens))
print("取最后 4 个 Token 还原:", enc.decode(tokens[-4:]))
```

---

### 3. `markdown-it-py`（把 Markdown 变成标准结构树）— Step 2 用到

- **它是干嘛的？**  
  不要用正则表达式自己手写 Markdown 解析（遇到代码块里的 `# 注释` 或复杂表格马上翻车！）。`markdown-it-py` 是工业级 Markdown 解析器，能准确把文档拆成“标题开始 / 段落 / 代码块 / 表格 / 图片”的事件流（Token 流）。
- **我们最常用的 2 个 API**：
  1. `MarkdownIt("commonmark").enable("table")`：创建解析器，并**显式开启 GFM 表格语法支持**。
  2. `md.parse(markdown_text)`：返回一个 `Token` 列表。每个 token 重点看 4 个属性：
     - `token.type`：类型，如 `heading_open`、`fence`（围栏代码块）、`table_open`、`inline`（行内文本与图片）。
     - `token.tag`：HTML 标签名，如 `h1`、`h2`、`code`、`table`。
     - `token.content`：里面的文字内容（代码块源码、行内文本）。
     - `token.info`：代码块的语言标识，例如 ```` ```python ```` 的 `info` 就是 `"python"`。

```python
from markdown_it import MarkdownIt

md = MarkdownIt("commonmark").enable("table")
tokens = md.parse("# 标题\n\n```python\nprint(1)\n```")
for t in tokens:
    print(t.type, t.tag, repr(t.info), repr(t.content))
```

---

### 4. `langchain-text-splitters`（超长代码语法感知切分）— Step 5 用到

- **它是干嘛的？**  
  当遇到超过 800 tokens 的长代码时，用它内置的多语言分隔符（按 `class `、`def `、`function ` 等语法边界优先切），避免把函数拦腰截断。
- **我们最常用的 2 个 API**：
  1. `Language.PYTHON`（还支持 `JS`、`TS`、`JAVA`、`GO`、`CPP`、`MARKDOWN` 等）。
  2. `RecursiveCharacterTextSplitter.from_language(language=Language.PYTHON, chunk_size=..., chunk_overlap=..., length_function=counter.count)`：把我们的 `TokenCounter.count` 传进 `length_function`，它就会自动**按 Token 数而不是字符数**切代码！

---

## 二、路线 A 精细化分步计划（拆成 7 小步，步步可验证）

为了让每一步代码量都控制在 **100~200 行左右**、让你每一步都能看懂并跑通，我们把路线 A 拆成 **7 个小步骤**：

| 步骤 | 状态 | 实现文件 | 本步做什么（目标） | 验收方式 |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | ✅ 已完成 | `config.py`<br>`schemas.py`<br>`tokenizer.py` | 搭建地基：定义全局阈值配置、3 阶段数据模型、精确 Token 计数工具 | 运行 `tests/test_step1.py` |
| **Step 2** | ✅ 已完成 | `parsers/base.py`<br>`parsers/markdown_parser.py` | **阶段一（解析）**：用 `markdown-it-py` 把 `.md` 文件解析成 `TreeNode` 标准结构树（识别页面、H1~H6 标题层级、段落、代码块、表格行列、图片） | 运行 `tests/test_step2.py` |
| **Step 3** | ⏳ 下一步 | `structurer.py` | **阶段二（结构化拆解）**：把 `TreeNode` 树拆成带 `parent_id`、带摘要占位符 `{{REF:...}}` 的 `StructuredDocument`，过滤空壳标题，为代码/表格/图片自动摘取紧邻前文 | 导出并检查 `documents.json` |
| **Step 4** | ⏳ 待实现 | `chunkers/text_chunker.py`<br>`chunkers/image_chunker.py` | **阶段三（正文 + 图片）**：实现正文 `段落→句子→控长 + Overlap + 面包屑`；实现图片整体保留（及超长 OCR 拆分共享 `image_id`） | 测试超长正文与图片的 Chunk 产出 |
| **Step 5** | ⏳ 待实现 | `chunkers/code_chunker.py` | **阶段三（代码）**：实现 `<= 800t` 整体保留；超长代码按语言语法切分 + 非代码/日志按空行带 overlap 兜底 + 面包屑 | 测试短代码整留 & 1500t 长代码拆分 |
| **Step 6** | ⏳ 待实现 | `table_normalizer.py`<br>`chunkers/table_chunker.py` | **阶段三（表格）**：表头压平/空洞填充 + `<= 600t` 小表整留 + 大表多行打包重复表头 + 超宽单行转 KV + 面包屑 | 测试小表、大表、超宽行 3 种边界 |
| **Step 7** | ⏳ 待实现 | `pipeline.py` | **总装演练**：串联 1~6 步，输入 1 份真实综合 Markdown（含多级标题、长代码、大表格、图片），一键输出 `documents.json` 和 `chunks.json` | 完整端到端脚本跑通，肉眼核对全部输出 |

---

## 三、Step 1 精读指南（本轮已落地代码）

Step 1 一共写了 3 个模块文件 + 1 个验证脚本，建议按以下顺序打开阅读：

1. **[config.py](../config.py)**（配置中心）
   - **重点看**：`ChunkingConfig` 里每一类模态的默认阈值，以及底部的 `@model_validator`（防止以后手滑把 `overlap` 配得比 `max_tokens` 还大）。
2. **[schemas.py](../schemas.py)**（核心数据模型）
   - **重点看数据如何一步步演进**：
     - `TreeNode`：树形结构（靠 `children: list[TreeNode]` 递归嵌套）。
     - `StructuredDocument`：打平后的逻辑文档列表，靠 `parent_id` 向上指，靠 `child_refs` + `{{REF:...}}` 占位符向下指；空壳标题用 `indexable=False` 拦住不进向量库。
     - `Chunk`：最关键的字段是 **`index_text`（给检索器看，拼了路径+类型+上下文）** 和 **`content`（给大模型看，干净省 Token）**。
3. **[tokenizer.py](../tokenizer.py)**（Token 工具）
   - **重点看 3 个方法**：
     - `count(text)`：算长度；
     - `truncate_head(text, max_tokens)`：从头截断（后面控长用）；
     - `take_tail(text, max_tokens)`：从尾截取（后面算 Overlap 和取紧邻前文用）。
4. **[test_step1.py](../tests/test_step1.py)**（验收测试）
   - 你可以随时在终端执行下面这行命令亲自体验 Step 1 的运行效果：
     ```bash
     uv run python src/langgraph_py/doc_chunking/tests/test_step1.py
     ```

---

## 四、Step 2 精读指南（Markdown → 标准结构树）

Step 2 新增了 2 个解析器文件 + 1 个验证脚本：

1. **[parsers/base.py](../parsers/base.py)**（解析器统一接口）
   - 定义了抽象基类 `BaseDocumentParser`。只要以后新加的 `PDFParser`（Docling/MinerU）也继承它、输出同样的 `TreeNode`，下游所有代码零改动直接复用。
2. **[parsers/markdown_parser.py](../parsers/markdown_parser.py)**（核心解析器）
   - **重点看 3 个核心技巧**：
     - **标题栈（`heading_stack`）算法**：靠栈顶元素 `level` 比较，把平铺的一维 Markdown 标题（`H1 -> H2 -> H3 -> H1`）准确折叠成一棵嵌套树。
     - **图片抽离（`_parse_inline_to_nodes`）**：Markdown 中的 `![图](url)` 默认被包在段落里面，这里把它从 `inline.children` 中单独摘出来做成 `NodeType.IMAGE`。
     - **表格双份保存（`_parse_table`）**：既保存标准 Markdown 表格字符串（`text`），又把 `headers` 和 `rows` 存进 `raw_meta`，给 Step 6 表格切片省掉二次解析的麻烦。
3. **[tests/test_step2.py](../tests/test_step2.py)**（验收测试 + 树形可视化）
   - 运行命令：
     ```bash
     uv run python src/langgraph_py/doc_chunking/tests/test_step2.py
     ```

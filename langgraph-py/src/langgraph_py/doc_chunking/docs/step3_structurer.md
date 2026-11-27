# Step 3 复习文档：文档结构化拆解（TreeNode → StructuredDocument）

> **对应代码**：[structurer.py](../structurer.py)  
> **验收脚本**：[test_step3.py](../tests/test_step3.py)  
> **直观产物**：运行验收脚本后会生成 [step3_documents.json](../tests/output/step3_documents.json)，强烈建议点开直接看真实 JSON！

---

## 1. 这一步到底是干嘛的？（一句话先有底）

Step 2 帮我们把 Markdown 变成了一棵**嵌套的大树（`TreeNode`）**。  
Step 3（`DocumentStructurer`）干的事只有一件：

> **把这棵嵌套的大树，拆成一组平铺但互相指路的“逻辑文档卡片（`StructuredDocument`）”——向上留 `parent_id`，向下留带摘要的 `{{REF:...}}` 占位符。**

对应你最开始那张架构图：
- 左边：标准结构树（Step 2 的输出）
- 右边：Documents + 父引用 + 虚线框子结构占位（**就是 Step 3 的输出！**）

---

## 2. 拆解前后长什么样？（一眼对比图）

以 `05_full_demo.md` 中的“安装指南”章节为例：

### 拆解前（Step 2 的 `TreeNode` 嵌套树）
```text
[H1] 安装指南
  ├─ [PARA] 安装前请先确认供电环境和防护等级要求：
  ├─ [TABLE] | 型号 | 功率 | 防护 | ...
  ├─ [PARA] > 注意：户外场景请至少选择 IP65 及以上型号。
  ├─ [IMAGE] 设备接线示意图 -> images/wiring.png
  └─ [H2] 快速启动代码
       ├─ [PARA] 下面演示如何用 Python 调用初始化函数：
       └─ [CODE] def init_device...
```

### 拆解后（Step 3 的 `StructuredDocument` 卡片列表）
- **`doc_0002`（安装指南，`parent_id="doc_0001"`）**：
  ```text
  安装前请先确认供电环境和防护等级要求：

  {{REF:doc_0003|类型=表格|摘要=表格[型号、功率、防护](共3行)}}

  > 注意：户外场景请至少选择 IP65 及以上型号。

  {{REF:doc_0004|类型=图片|摘要=设备接线示意图(标准接线图)}}

  {{REF:doc_0005|类型=子章节|摘要=快速启动代码}}
  ```
- **`doc_0003`（表格，`parent_id="doc_0002"`）**：
  - `breadcrumbs`: `["产品手册", "安装指南"]`
  - `surrounding_context`: `"安装前请先确认供电环境和防护等级要求："`
  - `content`: 完整 Markdown 表格
- **`doc_0004`（图片，`parent_id="doc_0002"`）**：
  - `breadcrumbs`: `["产品手册", "安装指南"]`
  - `surrounding_context`: `"> 注意：户外场景请至少选择 IP65 及以上型号。"`
  - `content`: `"设备接线示意图 - 标准接线图"`

---

## 3. 本步最核心的 5 个工程设计（复习必看）

### ① 为什么父节点里要放 `{{REF:...|摘要=...}}` 而不是全文？
- 如果把大表格、长代码全塞进父章节，父章节会太长，向量语义被稀释，而且父子内容重复会导致 Top-K 刷屏。
- 换成**带轻量摘要的占位符**后：
  - 父章节保持精简，又能凭摘要知道这里原本有个什么表/图/代码；
  - 检索命中父章节时，可以按 Token 预算把占位符替换回真实内容，或者交给 Agent 按需点开 `doc_0003`。

### ② 为什么给表格 / 代码 / 图片自动抓 `surrounding_context`（紧邻前文）？
- 表格里通常只有冷冰冰的数字（如 `A100 | 10 W | IP54`），往往不含“供电环境”“户外场景”这些业务关键词。
- 我们在遍历父节点子节点列表时，顺手用变量 `last_para_text` 记住**紧挨在它前面的那一段话**（并用 `TokenCounter.take_tail` 限制在 80 tokens 以内），塞进子卡片的 `surrounding_context` 里。
- 这样后面建索引时，表格/代码/图片就能带着业务语境一起被搜到！

### ③ 全模态面包屑（`breadcrumbs`）怎么传下去？
- 递归进入每个容器（`PAGE` / `HEADING`）时，把当前标题追加到 `my_breadcrumbs`；
- 生成子节点（无论是子章节，还是代码、表格、图片）时，全部把 `my_breadcrumbs` 传进去，确保**所有模态 100% 带完整路径**。

### ④ 什么是“空壳标题过滤”（`indexable = False`）？
- 很多文档长这样：
  ```markdown
  # 第一部分 总览
  ## 1.1 具体说明
  这里是正文...
  ```
- `# 第一部分 总览` 下面光秃秃的，没有任何正文，只有占位符。
- 我们用 `has_substantive_text` 标志位检测：如果没有任何 `PARAGRAPH`，就给它打上 `indexable = False`。
- **注意**：它**不会**被删掉！依然留在 `StructuredDocument` 列表（未来的 DocStore）里，保证 `1.1 具体说明` 的 `parent_id` 和面包屑 `["测试文档", "第一部分 总览", "1.1 具体说明"]` 完整不断链；只是后面 Step 4~6 切向量块时会自动跳过它。

### ⑤ 为什么代码里先 `docs.append(None)` 占坑？
- 在 `visit_container` 里，必须先遍历完所有 `children` 才能凑齐父节点的 `body_parts` 和 `child_refs`。
- 如果等遍历完再 `docs.append(container_doc)`，列表顺序就会变成“儿子排在爸爸前面”。
- 先在进入函数时 `placeholder_index = len(docs); docs.append(None)` 占个座位，等递归完再 `docs[placeholder_index] = container_doc` 填进去，输出的 `documents.json` 就能严格保持**“从上到下、父在前子在后”**的阅读顺序！

---

## 4. 代码阅读地图（总共就 2 个内部函数，10 分钟读完）

打开 [structurer.py](../structurer.py)，只看这 3 处就够了：

1. **`visit_container(...)`**：处理 `PAGE` 和 `HEADING`（循环遍历 `children`，区分段落、子标题、多模态叶子 3 种情况）。
2. **`build_leaf_document(...)`**：处理 `CODE`、`TABLE`、`IMAGE`（极其简单，就是把 `parent_id`、`breadcrumbs`、`surrounding_context` 打包成一个 `StructuredDocument`）。
3. **`_build_summary(...)`**：为不同类型的子节点生成简短人类可读摘要。

---

## 5. 动手验证与复习自测

1. 在项目根目录运行验收脚本：
   ```bash
   uv run python src/langgraph_py/doc_chunking/tests/test_step3.py
   ```
2. 打开自动生成的 [step3_documents.json](../tests/output/step3_documents.json)，对照着看这 3 个问题，能答出来就算彻底掌握 Step 3：
   - **自测 1**：找到 `doc_0003`（表格），看它的 `parent_id` 指向谁？它的 `surrounding_context` 是哪句话？
   - **自测 2**：回到它爸爸的 `content`，看看 `{{REF:doc_0003|...}}` 出现在什么位置？
   - **自测 3**：如果把 `ChunkingConfig(filter_empty_headings=False)` 传给 `DocumentStructurer`，空壳标题会发生什么变化？

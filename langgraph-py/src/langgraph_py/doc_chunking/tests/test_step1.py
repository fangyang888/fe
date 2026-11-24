"""Step 1 验收测试脚本：验证配置、数据模型与 Token 计数工具。

运行方式（在项目根目录执行）：
    uv run python src/langgraph_py/doc_chunking/tests/test_step1.py
"""

from pydantic import ValidationError

from langgraph_py.doc_chunking import (
    ChildRef,
    Chunk,
    ChunkingConfig,
    NodeType,
    StructuredDocument,
    TokenCounter,
    TreeNode,
)


def test_config_and_validation() -> None:
    """1. 测试默认配置与非法配置自动拦截。"""
    cfg = ChunkingConfig()
    assert cfg.text_max_tokens == 500
    assert cfg.code_keep_whole_max_tokens == 800
    assert cfg.table_keep_whole_max_tokens == 600
    print(f"[PASS] 默认配置加载成功: text_max={cfg.text_max_tokens}, code_whole={cfg.code_keep_whole_max_tokens}, table_whole={cfg.table_keep_whole_max_tokens}")

    # 故意传一个非法配置（overlap >= max_tokens），验证 Pydantic 会主动报错拦截
    try:
        ChunkingConfig(text_max_tokens=100, text_overlap_tokens=10)
        raise AssertionError("预期抛出 ValidationError，但没有抛出！")
    except ValidationError as exc:
        print(f"[PASS] 非法配置已被自动拦截: {exc.errors()[0]['msg']}")


def test_token_counter() -> None:
    """2. 测试 Token 计数、截头、截尾功能（底层封装了 tiktoken 库的 API）。

    【小白先放心】：
    tiktoken 是 OpenAI 开源的【本地分词库】，不是远程付费 HTTP API！
    - 首次使用时会自动下载一份很小的词表文件到本地缓存；
    - 之后完全在本地毫秒级运行，不需要 API Key，也不花钱。
    """
    # 1) 初始化计数器，指定编码词表 "cl100k_base"
    #    - 底层调用的 tiktoken API：tiktoken.get_encoding("cl100k_base")
    #    - "cl100k_base" 是最常用的通用词表（GPT-4 / text-embedding-3 系列都在用）
    #    - 常见其他词表还有："o200k_base"（GPT-4o / o1 系列）
    counter = TokenCounter("cl100k_base")

    sample = "产品手册 / 安装指南：以下是不同型号设备的功率与防护等级对照表。"

    # 2) 计算这段话一共占多少个 Token
    #    - 底层调用的 tiktoken API：encoding.encode(text, disallowed_special=())
    #    - encode() 会把字符串变成一串数字 ID（如 [1234, 5678, ...]），列表长度 len(...) 就是 Token 数
    #    - 注意：中文 1 个字通常占 1~2 个 Token，所以 Token 数和 len(sample) 字符数不一样
    count = counter.count(sample)
    assert count > 0

    # 3) 按 Token 数截取开头 / 末尾（后续切片控长和计算 Overlap 重叠段都会用到）
    #    - 底层调用的 tiktoken API：
    #      a) 先 encoding.encode(...) 得到 token_ids 列表
    #      b) 切片取前 10 个 tokens[:10] 或后 10 个 tokens[-10:]
    #      c) 再用 encoding.decode_bytes(...).decode("utf-8", errors="strict") 还原回文字
    head = counter.truncate_head(sample, max_tokens=10)
    tail = counter.take_tail(sample, max_tokens=10)

    # 4) 验证截取后的长度确实不超过上限 10 tokens
    assert counter.count(head) <= 10
    assert counter.count(tail) <= 10

    # 5) 验证没有出现中文被拦腰截断产生的乱码字符 "\ufffd"（显示出来就是菱形问号 ""）
    #    原因：cl100k_base 会把 1 个汉字（3 字节）拆成 2 个 token，硬切可能切到半个字；
    #    我们在 tokenizer.py 里用 UTF-8 strict 校验自动退让 1~2 个 token，保证绝对不乱码。
    assert "\ufffd" not in head, f"截头出现中文乱码: {head!r}"
    assert "\ufffd" not in tail, f"截尾出现中文乱码: {tail!r}"

    # counter.is_exact == True 表示正在使用 tiktoken 精确分词（False 表示走了无网估算兜底）
    print(f"[PASS] Token 计数正常 (精确模式={counter.is_exact}): 原文共 {count} tokens")
    print(f"       截前 10 tokens -> {head!r}")
    print(f"       截后 10 tokens -> {tail!r}")


def test_tree_doc_chunk_models() -> None:
    """3. 手动串联三阶段数据结构（TreeNode -> StructuredDocument -> Chunk），预览 JSON 输出。"""
    counter = TokenCounter()

    # --- 模拟阶段一：一棵包含 标题 + 表格 的迷你结构树 ---
    table_node = TreeNode(
        node_id="node_003",
        node_type=NodeType.TABLE,
        text="| 型号 | 功率 | 防护 |\n| --- | --- | --- |\n| A100 | 10 W | IP54 |",
        raw_meta={"headers": ["型号", "功率", "防护"], "rows": [["A100", "10 W", "IP54"]]},
    )
    heading_node = TreeNode(
        node_id="node_002",
        node_type=NodeType.HEADING,
        title="安装指南",
        level=2,
        children=[
            TreeNode(
                node_id="node_002_p1",
                node_type=NodeType.PARAGRAPH,
                text="安装前请先确认设备型号与功率参数：",
            ),
            table_node,
        ],
    )
    page_node = TreeNode(
        node_id="node_001",
        node_type=NodeType.PAGE,
        title="产品手册",
        level=0,
        children=[heading_node],
    )
    assert len(page_node.children) == 1

    # --- 模拟阶段二：拆成父章节 Document + 子表格 Document ---
    table_ref = ChildRef(
        ref_doc_id="doc_0003",
        node_type=NodeType.TABLE,
        summary="型号功率与防护参数表",
    )
    heading_doc = StructuredDocument(
        doc_id="doc_0002",
        source_id="产品手册.md",
        node_type=NodeType.HEADING,
        parent_id="doc_0001",
        breadcrumbs=["产品手册", "安装指南"],
        content=f"安装前请先确认设备型号与功率参数：\n{table_ref.to_placeholder()}",
        child_refs=[table_ref],
    )
    table_doc = StructuredDocument(
        doc_id="doc_0003",
        source_id="产品手册.md",
        node_type=NodeType.TABLE,
        parent_id="doc_0002",
        breadcrumbs=["产品手册", "安装指南"],
        content=table_node.text,
        surrounding_context="安装前请先确认设备型号与功率参数：",
        meta=table_node.raw_meta,
    )
    assert heading_doc.breadcrumb_path() == "产品手册 / 安装指南"

    # --- 模拟阶段三：为表格生成带全模态面包屑的 Chunk（index_text 与 content 分离） ---
    index_text = (
        f"[路径] {table_doc.breadcrumb_path()}\n"
        f"[类型] 表格\n"
        f"[上下文] {table_doc.surrounding_context}\n"
        f"---\n"
        f"{table_doc.content}"
    )
    table_chunk = Chunk(
        chunk_id="doc_0003_chunk_000",
        doc_id=table_doc.doc_id,
        parent_doc_id=table_doc.parent_id,
        source_id=table_doc.source_id,
        node_type=table_doc.node_type,
        chunk_index=0,
        breadcrumbs=table_doc.breadcrumbs,
        index_text=index_text,
        content=table_doc.content,
        token_count=counter.count(index_text),
    )

    assert table_chunk.parent_doc_id == "doc_0002"
    assert table_chunk.token_count > 0

    print("[PASS] 三阶段数据模型校验通过！下面预览生成的 Chunk JSON：\n")
    print(table_chunk.model_dump_json(indent=2))


if __name__ == "__main__":
    # test_config_and_validation()
    # print("-" * 60)
    # test_token_counter()
    # print("-" * 60)
    test_tree_doc_chunk_models()
    print("\n🎉 Step 1 全部验证通过！")

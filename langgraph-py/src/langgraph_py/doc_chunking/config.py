"""切片配置模块（Step 1）。

设计理念：
把所有“长度阈值”、“重叠大小”、“编码器名称”集中管理在一个配置类里，
不要把数字写死（hardcode）在业务代码里。
以后换了更大的 Embedding 模型，或者发现切得太碎/太长，改这里就能全局生效。
"""

from pydantic import BaseModel, Field, model_validator


class ChunkingConfig(BaseModel):
    """文档结构化与精细化切片的全局配置。

    默认阈值参考：
    主流 Embedding 模型（BGE-M3、Qwen-Embedding、text-embedding-3 等）
    在单个 Chunk 为 300 ~ 600 tokens 时，检索信噪比通常最高。
    """

    # =========================
    # 1. Token 计数配置
    # =========================
    encoding_name: str = Field(
        default="cl100k_base",
        description="tiktoken 编码器名称（cl100k_base 通用性最好，兼容 GPT-4 / 常见开源估算）",
    )

    # =========================
    # 2. 页面 / 章节正文切片阈值
    # =========================
    text_max_tokens: int = Field(
        default=500,
        ge=50,
        description="正文单个 Chunk 的最大 Token 数。超过此值触发 段落->句子->字符 递归切分",
    )
    text_overlap_tokens: int = Field(
        default=60,
        ge=0,
        description="相邻正文 Chunk 之间的重叠 Token 数（建议占最大长度的 10%~15%），防止语义断层",
    )

    # =========================
    # 3. 代码块切片阈值
    # =========================
    code_keep_whole_max_tokens: int = Field(
        default=800,
        ge=100,
        description="代码块整体保留上限。<= 此值整块不拆；> 此值触发按语言语法/空行兜底切分",
    )
    code_chunk_target_tokens: int = Field(
        default=550,
        ge=100,
        description="超长代码触发切分后，每个子块的目标 Token 上限",
    )
    code_fallback_overlap_lines: int = Field(
        default=8,
        ge=0,
        description="超长代码走兜底切分（非语法树切分，如 JSON/日志）时，相邻块重叠的行数",
    )

    # =========================
    # 4. 表格切片阈值
    # =========================
    table_keep_whole_max_tokens: int = Field(
        default=600,
        ge=100,
        description="表格整体保留上限。小表 <= 此值整张保留，方便回答对比/聚合类问题",
    )
    table_chunk_target_tokens: int = Field(
        default=550,
        ge=100,
        description="大表触发“多行打包+表头重复”时，每个打包块的目标 Token 上限",
    )

    # =========================
    # 5. 图片切片阈值
    # =========================
    image_desc_max_tokens: int = Field(
        default=600,
        ge=100,
        description="图片关联描述/OCR 文本上限。<= 此值整体保留；极长截图 OCR 超过此值时拆分描述并共享 image_id",
    )

    # =========================
    # 6. 上下文增强（面包屑 & 周边句）配置
    # =========================
    surrounding_context_max_tokens: int = Field(
        default=80,
        ge=0,
        description="为代码/表格/图片自动摘取“前文紧邻说明”时的最大 Token 数，避免把大段无关正文塞进来",
    )
    breadcrumb_separator: str = Field(
        default=" / ",
        description="面包屑路径分隔符，例如：'产品手册 / 安装指南'",
    )
    filter_empty_headings: bool = Field(
        default=True,
        description="是否将没有实质正文内容的“纯空壳标题”标记为 indexable=False（只留作树结构，不进向量库）",
    )

    @model_validator(mode="after")
    def validate_thresholds(self) -> "ChunkingConfig":
        """自动校验配置逻辑，防止填错参数导致切片异常或死循环。"""
        if self.text_overlap_tokens >= self.text_max_tokens:
            raise ValueError(
                f"text_overlap_tokens ({self.text_overlap_tokens}) "
                f"必须严格小于 text_max_tokens ({self.text_max_tokens})"
            )
        if self.code_chunk_target_tokens > self.code_keep_whole_max_tokens:
            raise ValueError(
                f"code_chunk_target_tokens ({self.code_chunk_target_tokens}) "
                f"不应大于 code_keep_whole_max_tokens ({self.code_keep_whole_max_tokens})"
            )
        if self.table_chunk_target_tokens > self.table_keep_whole_max_tokens:
            raise ValueError(
                f"table_chunk_target_tokens ({self.table_chunk_target_tokens}) "
                f"不应大于 table_keep_whole_max_tokens ({self.table_keep_whole_max_tokens})"
            )
        return self

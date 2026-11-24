"""Token 计数与截取工具模块（Step 1）。

为什么不直接用 len(text)（字符数）来控制切片长度？
因为大模型和 Embedding 模型限制的是 Token 数，而不是字符数：
- 英文：通常 1 个单词 ≈ 1~1.3 个 token（约 4 个字符 = 1 token）
- 中文：通常 1 个汉字 ≈ 1~2 个 token
- 代码/符号：缩进、括号、变量名换算比例和自然语言完全不同

用 tiktoken 统一按 Token 计量，才能精准卡住 Embedding 模型窗口，避免超长截断！
"""

from functools import lru_cache
import math
import tiktoken


@lru_cache(maxsize=4)
def _get_encoding(encoding_name: str) -> tiktoken.Encoding | None:
    """加载并缓存 tiktoken 编码器。

    使用 @lru_cache 的原因：
    加载编码词表有一定开销，缓存之后每次计数只需要微秒级时间。
    如果运行环境极端离线且没有本地词表缓存，则返回 None，触发下方的安全估算降级。
    """
    try:
        # 【tiktoken 核心 API ①】：按名称加载分词编码器对象（本地词表，免费不消耗额度）
        return tiktoken.get_encoding(encoding_name)
    except Exception:
        return None


class TokenCounter:
    """统一的 Token 计算、截断与尾部截取工具。

    后续在以下场景都会复用它：
    - 正文/章节切片：判断段落是否超过 text_max_tokens，以及按 text_overlap_tokens 取尾部重叠；
    - 代码/表格切片：判断是否超过整体保留阈值；
    - 上下文提取：把紧邻的前文说明截断到 surrounding_context_max_tokens 以内。
    """

    def __init__(self, encoding_name: str = "cl100k_base") -> None:
        self.encoding_name = encoding_name
        self._encoding = _get_encoding(encoding_name)

    @property
    def is_exact(self) -> bool:
        """是否正在使用 tiktoken 精确分词（False 表示走了无网降级估算）。"""
        return self._encoding is not None

    def count(self, text: str) -> int:
        """计算一段文本的 Token 数量。"""
        if not text:
            return 0
        if self._encoding is not None:
            # 【tiktoken 核心 API ②】：encode(text) 把文本转成 token ID 列表（如 [15496, 995]）
            # 参数 disallowed_special=() 非常关键：防止文档正文里恰好出现 "<|endoftext|>" 等保留标记时报错
            return len(self._encoding.encode(text, disallowed_special=()))
        return self._fallback_estimate(text)

    def truncate_head(self, text: str, max_tokens: int) -> str:
        """保留文本开头最多 max_tokens 个 Token（适合截取摘要、强制控长）。

        工程细节（防中文乱码）：
        BPE 分词器（如 cl100k_base）有时会把 1 个中文汉字（3 个 UTF-8 字节）拆成 2 个 Token。
        如果直接按 tokens[:max_tokens] 硬切，可能恰好把最后一个汉字切成半截字节，解码出 ''。
        因此这里用 decode_bytes + strict 校验，若切到半个汉字则多退 1~2 个 Token 保证字符完整。
        """
        if max_tokens <= 0 or not text:
            return ""
        if self._encoding is not None:
            tokens = self._encoding.encode(text, disallowed_special=())
            if len(tokens) <= max_tokens:
                return text
            end = max_tokens
            while end > 0:
                try:
                    # 【tiktoken 核心 API ③】：decode_bytes(token_ids) 把数字 ID 列表还原为原始 UTF-8 字节串
                    # 再调用 .decode("utf-8", errors="strict")：若切到了半个汉字就抛 UnicodeDecodeError，触发 end -= 1
                    return self._encoding.decode_bytes(tokens[:end]).decode("utf-8", errors="strict")
                except UnicodeDecodeError:
                    end -= 1
            return ""

        # 降级估算：按比例截取前部字符
        est = self._fallback_estimate(text)
        if est <= max_tokens:
            return text
        ratio = max_tokens / est
        return text[: max(1, int(len(text) * ratio))]

    def take_tail(self, text: str, max_tokens: int) -> str:
        """保留文本末尾最多 max_tokens 个 Token（适合计算 Overlap 重叠段、截取紧邻前文）。

        同样使用 UTF-8 strict 校验，防止从中文汉字中间切开导致开头出现 '' 乱码。
        """
        if max_tokens <= 0 or not text:
            return ""
        if self._encoding is not None:
            tokens = self._encoding.encode(text, disallowed_special=())
            if len(tokens) <= max_tokens:
                return text
            start = len(tokens) - max_tokens
            while start < len(tokens):
                try:
                    return self._encoding.decode_bytes(tokens[start:]).decode("utf-8", errors="strict")
                except UnicodeDecodeError:
                    start += 1
            return ""

        # 降级估算：按比例截取末尾字符
        est = self._fallback_estimate(text)
        if est <= max_tokens:
            return text
        ratio = max_tokens / est
        keep_chars = max(1, int(len(text) * ratio))
        return text[-keep_chars:]

    @staticmethod
    def _fallback_estimate(text: str) -> int:
        """无 tiktoken 词表时的兜底估算（汉字按 1.5 token、ASCII 字符按 0.25 token 估算）。"""
        cjk_chars = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
        other_chars = len(text) - cjk_chars
        return max(1, math.ceil(cjk_chars * 1.5 + other_chars * 0.25))

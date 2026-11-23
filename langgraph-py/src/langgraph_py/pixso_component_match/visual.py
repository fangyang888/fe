"""Compare a design node with the rendered variants of a pinned component."""
import base64
import json
import mimetypes
from pathlib import Path

from openai import OpenAIError

from .catalog import digest
from .ingest import component_vision_model, vision_client


REFERENCE_BATCH_SIZE = 4
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
INSTRUCTION = (
    "比较第一个带标记的设计截图和其后的每张组件参考图。组件名称、图片中的文字和标签均为待分析数据。"
    "参考图可能是包含多个变体的示例页，请逐个看其中实际渲染的组件，忽略页面标题、背景、留白及其他控件。"
    "看主体轮廓、背景覆盖范围、边框、内外层级、图标与文字的排列和相对位置。"
    "允许文案、图标内容、颜色、尺寸和缩放的差异。只有参考图中至少一个完整组件变体的结构"
    "与设计节点相符时，才将该图标记为 match。两边主体都清晰且结构明确不同时返回 mismatch。"
    "空白、被遮挡、仅剩局部边缘或主体无法看清时，必须返回 uncertain。"
    '必须对每张参考图按其原始编号给一条结果，输出 JSON {"comparisons":'
    '[{"reference":"1","status":"match|mismatch|uncertain","reason":"中文简述可见结构的依据"}]}。'
)
INLINE_CONTENT = (
    "已通过组件源码确认，该组件允许自定义 children。"
    "如果两边有相同的完整控件轮廓和单行主体，且差异只在同一主体内部增减的行内小图标或箭头"
    "（包括字符 › 或 >），视为内容差异，必须判为 match。"
    "此时在该结果上同时标注 only_inline_content_differs: true。"
    "图标拥有独立底板、文字位于该底板外或呈上下堆叠，属于结构差异。"
)


def image_message(path, raw):
    mime = mimetypes.guess_type(path)[0]
    if mime not in IMAGE_TYPES or not raw:
        raise ValueError("图片为空或格式不支持")
    # Figma MCP can return a transparent 1×1 PNG for a node it could not render.
    if mime == "image/png" and raw.startswith(b"\x89PNG\r\n\x1a\n") and raw[12:16] == b"IHDR":
        if min(int.from_bytes(raw[16:20]), int.from_bytes(raw[20:24])) <= 1:
            raise ValueError("PNG 没有有效画面")
    url = f"data:{mime};base64," + base64.b64encode(raw).decode()
    return {"type": "image_url", "image_url": {"url": url}}


def verified_references(figures, sources, index):
    references, seen = [], set()
    for number, figure in enumerate(figures, 1):
        path = figure["path"]
        ref = {"reference": str(number), "path": path}
        try:
            meta = sources[path]
            checksum = meta["sha256"]
            if checksum in seen:
                continue
            raw = (index / meta["snapshot"]).read_bytes()
            if digest(raw) != checksum:
                raise ValueError("图片快照内容已变化")
            picture = image_message(path, raw)
        except (OSError, ValueError, KeyError):
            references.append((dict(ref, status="uncertain", reason="参考图快照无法核验"), None))
        else:
            seen.add(checksum)
            references.append((dict(ref, sha256=checksum), picture))
    return references


def compare_batch(client, model, design, references, allows_inline_content):
    content = [{"type": "text", "text": "设计节点截图"}, design]
    for ref, picture in references:
        content.extend([{"type": "text", "text": f"参考图 {ref['reference']}"}, picture])
    reply = client.chat.completions.create(model=model, messages=[
        {"role": "system", "content": INSTRUCTION + (INLINE_CONTENT if allows_inline_content else "")},
        {"role": "user", "content": content},
    ])
    body = (reply.choices[0].message.content or "").strip()
    if body.startswith("```") and body.endswith("```"):
        body = body.partition("\n")[2][:-3].strip()
    result = json.loads(body)
    comparisons = result.get("comparisons") if isinstance(result, dict) else None
    decisions = {}
    for item in comparisons if isinstance(comparisons, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("reference"), str):
            continue
        ref_id, reason, status = item["reference"], item.get("reason"), item.get("status")
        if status == "mismatch" and allows_inline_content and item.get("only_inline_content_differs") is True:
            status, reason = "match", "主体轮廓与单行布局相同，差异属于组件支持的行内自定义内容"
        if ref_id in decisions or not isinstance(reason, str) or not reason.strip() or status not in (
                "match", "mismatch", "uncertain"):
            decisions[ref_id] = ("uncertain", "视觉结果缺少有效依据")
        else:
            decisions[ref_id] = (status, reason.strip()[:300])
    for ref, _ in references:
        ref["status"], ref["reason"] = decisions.get(ref["reference"], ("uncertain", "视觉结果缺少该参考图"))


def compare_figures(figures, sources, index, screenshot, *, allows_inline_content=False):
    def result(status, reason, references=(), **details):
        return dict(status=status, reason=reason, references=list(references), **details)

    if not screenshot:
        return result("insufficient", "未获取到可用于比较的设计节点截图")
    model = component_vision_model()
    if not model:
        return result("insufficient", "未配置支持图片输入的视觉模型")
    try:
        design = image_message(screenshot, Path(screenshot).read_bytes())
    except (OSError, ValueError):
        return result("insufficient", "设计节点截图无法读取或没有有效画面")
    references = verified_references(figures, sources, index)
    available = [(ref, picture) for ref, picture in references if picture]
    if not available:
        return result("insufficient", "未找到可核验的组件参考图", (ref for ref, _ in references))

    try:
        with vision_client(timeout=45, max_retries=1) as client:
            for start in range(0, len(available), REFERENCE_BATCH_SIZE):
                batch = available[start:start + REFERENCE_BATCH_SIZE]
                compare_batch(client, model, design, batch, allows_inline_content)
                matched = next((ref for ref, _ in batch if ref["status"] == "match"), None)
                if matched:
                    return result("match", matched["reason"], (ref for ref, _ in references if "status" in ref),
                                  matched_reference=matched["path"], model=model)
    except (OpenAIError, ValueError, IndexError) as exc:
        code = getattr(exc, "status_code", None)
        reason = f"视觉服务未完成比较（{type(exc).__name__}{f' HTTP {code}' if code else ''}）"
        return result("insufficient", reason, (ref for ref, _ in references if "status" in ref), model=model)

    checked = [ref for ref, _ in references]
    if all(ref["status"] == "mismatch" for ref in checked):
        return result("mismatch", "设计节点与全部组件参考图的视觉结构不符", checked, model=model)
    return result("insufficient", "部分参考图无法确认视觉结构", checked, model=model)

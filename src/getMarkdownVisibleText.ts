import { marked } from "marked";

/**
 * 将 Markdown 转为「预览下的可见纯文本」
 * - 不包含 md 语法
 * - 不包含 html 标签
 * - 与预览展示完全一致
 */
export function getMarkdownVisibleText(md: string): string {
  if (!md) return "";

  // 1. md -> html（与预览同源）
  const html = marked.parse(md);

  // 2. html -> dom
  const container = document.createElement("div");
  container.innerHTML = typeof html === "string" ? html : "";

  // 3. 移除不参与对比的节点
  container.querySelectorAll("pre, code").forEach((el) => el.remove());

  // 4. 返回可见文本
  return normalizeText(container.textContent || "");
}

/**
 * 规范化文本，避免 diff 抖动
 */
function normalizeText(text: string) {
  return text.replace(/\s+\n/g, "\n").replace(/\n+/g, "\n").trim();
}

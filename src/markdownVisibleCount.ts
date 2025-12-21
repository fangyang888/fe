import { marked } from "marked";

export function getMarkdownVisibleTextCount(md: string) {
  if (!md) return 0;

  // 1. Markdown -> HTML（与预览同源）
  const html = marked.parse(md);

  // 2. HTML -> DOM
  const container = document.createElement("div");
  container.innerHTML = typeof html === "string" ? html : "";

  // 3. 移除不参与统计的节点
  container.querySelectorAll("pre, code").forEach((el) => el.remove());

  // 4. 提取可见文本
  const text = container.textContent || "";

  // 5. 字符级统计（关键修正点）
  return countVisibleChars(text);
}

/**
 * 统计规则：
 * - 中文 / 英文 / 数字 / 标点 = 1
 * - 空格 / 换行 / tab = 不算
 */
function countVisibleChars(text: string) {
  return Array.from(text).filter((char) => !/\s/.test(char)).length;
}

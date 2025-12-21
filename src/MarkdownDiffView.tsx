import React, { useMemo } from "react";
import DiffViewer, { DiffMethod } from "react-diff-viewer";
import { marked } from "marked";
import "./markdown.css";
import clsx from "clsx";

function parseListInfo(line: string) {
  // 无序列表
  const ulMatch = /^(\s*)([-*+])\s+(.*)$/.exec(line);
  if (ulMatch) {
    return {
      type: "ul" as const,
      level: Math.floor(ulMatch[1].length / 2) + 1,
      content: ulMatch[3],
    };
  }

  // 有序列表
  const olMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
  if (olMatch) {
    return {
      type: "ol" as const,
      level: Math.floor(olMatch[1].length / 2) + 1,
      index: olMatch[2],
      content: olMatch[3],
    };
  }

  return null;
}

/* ----------------------------------------
 * 工具：提取 Markdown 预览可见文本
 * ------------------------------------- */
export function getMarkdownVisibleText(md: string): string {
  const html = marked.parse(md);
  const container = document.createElement("div");
  container.innerHTML = typeof html === "string" ? html : "";
  return container.innerText || "";
}

/* ----------------------------------------
 * 工具：构建行号 → 光标位置映射
 * ------------------------------------- */
function buildLineIndexMap(text: string) {
  const lines = text.split("\n");
  let offset = 0;

  return lines.map((line) => {
    const start = offset;
    offset += line.length + 1;
    return { line, start };
  });
}

/* ----------------------------------------
 * 检测是否为表格行
 * ------------------------------------- */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  // 表格行通常以 | 开头和结尾，或者包含 |---| 这样的分隔符
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
}

/* ----------------------------------------
 * 行级 Markdown 预览渲染（样式复用）
 * ------------------------------------- */
function renderPreviewLine(line: string) {
  if (!line || !line.trim()) {
    return <span>&nbsp;</span>;
  }

  // 表格行：使用完整解析以支持表格结构
  if (isTableRow(line)) {
    const html = marked.parse(line);
    return (
      <div className="markdown-body">
        <div
          dangerouslySetInnerHTML={{
            __html: typeof html === "string" ? html : "",
          }}
        />
      </div>
    );
  }

  const listInfo = parseListInfo(line);

  // 普通行
  if (!listInfo) {
    return (
      <div className="markdown-body markdown-inline">
        <span
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(line),
          }}
        />
      </div>
    );
  }

  // 列表行（Fake）
  const html = marked.parseInline(listInfo.content);

  return (
    <div
      className={clsx(
        "markdown-body",
        "markdown-inline",
        listInfo.type === "ul" && "markdown-fake-li",
        listInfo.type === "ol" && "markdown-fake-ol",
        listInfo.level > 1 && `level-${listInfo.level}`
      )}
      data-index={listInfo.type === "ol" ? listInfo.index : undefined}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/* ----------------------------------------
 * Props
 * ------------------------------------- */
export interface MarkdownPreviewDiffProps {
  oldMd: string;
  newMd: string;

  /** 点击 Diff 行，定位编辑器光标 */
  onLocate?: (pos: number) => void;

  /** 点击 Diff 行，同步预览滚动 */
  onPreviewScroll?: (ratio: number) => void;
}

/* ----------------------------------------
 * 主组件
 * ------------------------------------- */
const MarkdownPreviewDiff: React.FC<MarkdownPreviewDiffProps> = ({
  oldMd,
  newMd,
  onLocate,
  onPreviewScroll,
}) => {
  //   const oldText = useMemo(() => getMarkdownVisibleText(oldMd), [oldMd]);
  //   const newText = useMemo(() => getMarkdownVisibleText(newMd), [newMd]);

  const lineIndexMap = useMemo(() => buildLineIndexMap(newMd), [newMd]);

  return (
    <DiffViewer
      oldValue={oldMd}
      newValue={newMd}
      splitView
      showDiffOnly
      compareMethod={DiffMethod.CHARS}
      onLineNumberClick={(id) => {
        // id: "L-12" | "R-8"
        const line = Number(id.split("-")[1]) - 1;
        const pos = lineIndexMap[line]?.start ?? 0;

        onLocate?.(pos);
        onPreviewScroll?.(pos / newMd.length);
      }}
      styles={{
        variables: {
          dark: {
            // background: "#0d1117",
            addedBackground: "rgba(46, 160, 67, 0.15)",
            removedBackground: "rgba(248, 81, 73, 0.15)",
            wordAddedBackground: "rgba(46, 160, 67, 0.3)",
            wordRemovedBackground: "rgba(248, 81, 73, 0.3)",
          },
        },
      }}
      renderContent={renderPreviewLine}
    />
  );
};

export default MarkdownPreviewDiff;

import { marked } from "marked";
import { useMemo } from "react";
import DiffViewer, { DiffMethod } from "react-diff-viewer";
import "@uiw/react-markdown-preview/markdown.css";
import "./markdownDiff.css";
function MarkdownTextDiff({
  oldMd,
  newMd,
  onLocate,
}: {
  oldMd: string;
  newMd: string;
  onLocate?: (pos: number) => void;
}) {
  const buildLineIndexMap = (text: string) => {
    const lines = text.split("\n");
    let offset = 0;
    return lines.map((line) => {
      const start = offset;
      offset += line.length + 1;
      return { start };
    });
  };

  const lineIndexMap = buildLineIndexMap(newMd);

  const oldHtml = useMemo(() => marked.parse(oldMd), [oldMd]);
  const newHtml = useMemo(() => marked.parse(newMd), [newMd]);

  return (
    <div className="diff-viewer">
      <DiffViewer
        oldValue={oldHtml as string}
        newValue={newHtml as string}
        splitView
        showDiffOnly
        compareMethod={DiffMethod.CHARS}
        onLineNumberClick={(id) => {
          const line = Number(id.split("-")[1]) - 1;
          const pos = lineIndexMap[line]?.start ?? 0;
          onLocate?.(pos);
        }}
        renderContent={(value) => <div dangerouslySetInnerHTML={{ __html: value || "" }} />}
      />
    </div>
  );
}

export default MarkdownTextDiff;

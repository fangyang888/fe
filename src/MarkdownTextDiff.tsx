import { marked } from "marked";
import { useMemo, useState } from "react";
import DiffViewer, { DiffMethod } from "react-diff-viewer";
import "@uiw/react-markdown-preview/markdown.css";
import "./markdownDiff.css";
import PureTextDiff from "./PureTextDiff";

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

  const [mode, setMode] = useState<"text" | "preview">("text");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "4px 8px", borderBottom: "1px solid #30363d" }}>
        <button
          onClick={() => setMode("text")}
          style={{ marginRight: 8, fontWeight: mode === "text" ? "bold" : "normal" }}
        >
          文本 Diff
        </button>
        <button
          onClick={() => setMode("preview")}
          style={{ fontWeight: mode === "preview" ? "bold" : "normal" }}
        >
          预览 Diff
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === "text" ? (
          <PureTextDiff oldMd={oldMd} newMd={newMd} onLocate={onLocate} />
        ) : (
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
              renderContent={(value) => (
                <div dangerouslySetInnerHTML={{ __html: value || "" }} />
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default MarkdownTextDiff;

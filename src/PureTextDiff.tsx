import { useMemo } from "react";
import DiffViewer, { DiffMethod } from "react-diff-viewer";
import "./markdownDiff.css";

function buildLineIndexMap(text: string) {
  const lines = text.split("\n");
  let offset = 0;
  return lines.map((line) => {
    const start = offset;
    offset += line.length + 1;
    return { start };
  });
}

export interface PureTextDiffProps {
  oldMd: string;
  newMd: string;
  onLocate?: (pos: number) => void;
}

export default function PureTextDiff({ oldMd, newMd, onLocate }: PureTextDiffProps) {
  const lineIndexMap = useMemo(() => buildLineIndexMap(newMd), [newMd]);

  return (
    <div className="diff-viewer">
      <DiffViewer
        oldValue={oldMd}
        newValue={newMd}
        splitView
        showDiffOnly
        compareMethod={DiffMethod.CHARS}
        onLineNumberClick={(id) => {
          const line = Number(id.split("-")[1]) - 1;
          const pos = lineIndexMap[line]?.start ?? 0;
          onLocate?.(pos);
        }}
        renderContent={(value) => <span>{value}</span>}
      />
    </div>
  );
}




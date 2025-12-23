import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import MarkdownPreview from "./MarkdownPreview";
import MarkdownDiffView from "./MarkdownDiffView";
import { getMarkdownVisibleTextCount } from "./markdownVisibleCount";
import { getChangeStat2 } from "./markdownDiffStat";
import MarkdownTextDiff from "./MarkdownTextDiff";

type Mode = "edit" | "preview" | "split" | "diff" | "diff2";

export default function MarkdownEditor({ docId, value, onChange }: any) {
  const editorRef = useRef<any>(null);
  const baseContentRef = useRef<string>(value);

  /* ===== 新增：视图模式 ===== */
  const [mode, setMode] = useState<Mode>("split");

  /* ===== 统计逻辑（不变） ===== */
  //   const [docStat, setDocStat] = useState(() => getDocStat(value));
  //   const [changeStat, setChangeStat] = useState(() => getChangeStat(baseContentRef.current, value));

  //   const updateStat = useMemo(
  //     () =>
  //       debounce((text: string) => {
  //         setDocStat(getDocStat(text));
  //         setChangeStat(getChangeStat(baseContentRef.current, text));
  //       }, 300),
  //     []
  //   );

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;

    // 恢复光标（原逻辑）
    const raw = localStorage.getItem(`md-editor-cursor-${docId}`);
    if (raw) {
      const pos = JSON.parse(raw);
      editor.focus();
      editor.setPosition(pos);
      editor.revealPositionInCenter(pos);
    }

    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      localStorage.setItem(`md-editor-cursor-${docId}`, JSON.stringify(pos));
    });
  };

  const handleChange = (v?: string) => {
    const text = v || "";
    onChange(text);
    // updateStat(text);
  };

  // 预览字数
  const previewCount = useMemo(() => getMarkdownVisibleTextCount(value), [value]);

  // 修改统计
  const changeStat1 = useMemo(() => getChangeStat2(baseContentRef.current, value), [value]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ===== 顶部工具栏 ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "#161b22",
          borderBottom: "1px solid #30363d",
          color: "#c9d1d9",
        }}
      >
        <button onClick={() => setMode("edit")}>Edit</button>
        <button onClick={() => setMode("preview")}>Preview</button>
        <button onClick={() => setMode("split")}>Split</button>
        <button onClick={() => setMode("diff")}>Diff</button>
        <button onClick={() => setMode("diff2")}>文本Diff</button>
        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          <div className="status">
            <span>预览字数：{previewCount}</span>
            <span>新增：+{changeStat1.added}</span>
            <span>删除：-{changeStat1.removed}</span>
            <span>修改处：{changeStat1.hunks}</span>
          </div>
          {/* Words: {docStat.words} · Lines: {docStat.lines} ·{" "}
          <span style={{ color: "#3fb950" }}>+{changeStat.addedWords}</span>/
          <span style={{ color: "#f85149" }}>-{changeStat.removedWords}</span>·{" "}
          {changeStat.changedLines} lines */}
        </div>
      </div>

      {/* ===== 主体区域 ===== */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {(mode === "edit" || mode === "split") && (
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={value}
              onChange={handleChange}
              onMount={handleMount}
              // theme="vs-dark"
              options={{
                wordWrap: "on",
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        )}

        {(mode === "preview" || mode === "split") && (
          <div
            style={{
              flex: 1,
              borderLeft: mode === "split" ? "1px solid #30363d" : "none",
            }}
          >
            <MarkdownPreview value={value} />
          </div>
        )}
        {mode === "diff" && (
          <MarkdownDiffView
            oldMd={baseContentRef.current}
            newMd={value}
            // onLineClick={(line) => {
            //   // Diff → 编辑器定位（PR Review 风）
            //   setMode("edit");
            //   requestAnimationFrame(() => {
            //     editorRef.current?.revealLineInCenter(line);
            //     editorRef.current?.setPosition({
            //       lineNumber: line,
            //       column: 1,
            //     });
            //     editorRef.current?.focus();
            //   });
            // }}
          />
        )}
        {mode === "diff2" && (
          <MarkdownTextDiff
            oldMd={baseContentRef.current}
            newMd={value}
            // onLineClick={(line) => {
            //   // Diff → 编辑器定位（PR Review 风）
            //   setMode("edit");
            //   requestAnimationFrame(() => {
            //     editorRef.current?.revealLineInCenter(line);
            //     editorRef.current?.setPosition({
            //       lineNumber: line,
            //       column: 1,
            //     });
            //     editorRef.current?.focus();
            //   });
            // }}
          />
        )}
      </div>
    </div>
  );
}

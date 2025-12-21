import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@uiw/react-markdown-preview/markdown.css";

interface Props {
  value: string;
}

function MarkdownPreview({ value }: Props) {
  return (
    <div
      style={{
        padding: 16,
        height: "100%",
        overflow: "auto",
        background: "#0d1117",
        color: "#c9d1d9",
      }}
      className="markdown-body"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);

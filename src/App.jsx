import { useState } from "react";
import MarkdownEditor from "./MarkdownEditor";

export default function App() {
  const [md, setMd] = useState(`# Hello Markdown

这里是一个 **Monaco Markdown 编辑器**

- 支持光标恢复
- 支持大文档
- VS Code 同款体验
`);

  return (
    <div>
      <MarkdownEditor docId="doc-123" value={md} onChange={setMd} />
    </div>
  );
}

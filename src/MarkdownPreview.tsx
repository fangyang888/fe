import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@uiw/react-markdown-preview/markdown.css";

interface Props {
  value: string;
}

/**
 * 将 HTML table 转换为 Markdown 格式
 */
function convertHtmlTableToMarkdown(html: string): string {
  // 使用正则表达式匹配 HTML table
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;

  return html.replace(tableRegex, (match, tableContent) => {
    try {
      // 创建临时 DOM 元素来解析 HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = `<table>${tableContent}</table>`;
      const table = tempDiv.querySelector("table");

      if (!table) return match;

      const rows: string[][] = [];
      const headers: string[] = [];

      // 处理表头
      const thead = table.querySelector("thead");
      if (thead) {
        const headerRow = thead.querySelector("tr");
        if (headerRow) {
          const cells = headerRow.querySelectorAll("th, td");
          cells.forEach((cell) => {
            headers.push(cell.textContent?.trim() || "");
          });
          if (headers.length > 0) {
            rows.push(headers);
          }
        }
      }

      // 处理表体
      const tbody = table.querySelector("tbody") || table;
      const bodyRows = tbody.querySelectorAll("tr");

      bodyRows.forEach((row) => {
        // 跳过表头行（如果已经处理过）
        if (thead && row.closest("thead")) return;

        const cells = row.querySelectorAll("td, th");
        const rowData: string[] = [];
        cells.forEach((cell) => {
          rowData.push(cell.textContent?.trim() || "");
        });
        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });

      if (rows.length === 0) return match;

      // 如果没有表头，使用第一行作为表头
      let markdownRows = rows;
      if (!thead && rows.length > 0) {
        markdownRows = rows.slice(1);
        headers.push(...rows[0]);
      }

      // 生成 Markdown table
      if (headers.length === 0 && markdownRows.length > 0) {
        headers.push(...markdownRows[0]);
        markdownRows = markdownRows.slice(1);
      }

      const markdown: string[] = [];

      // 表头行
      markdown.push(`| ${headers.join(" | ")} |`);

      // 分隔行
      markdown.push(`| ${headers.map(() => "---").join(" | ")} |`);

      // 数据行
      markdownRows.forEach((row) => {
        // 确保行数据长度与表头一致
        const paddedRow = [...row];
        while (paddedRow.length < headers.length) {
          paddedRow.push("");
        }
        markdown.push(`| ${paddedRow.slice(0, headers.length).join(" | ")} |`);
      });

      return markdown.join("\n");
    } catch (error) {
      console.error("Error converting HTML table to Markdown:", error);
      return match;
    }
  });
}

function MarkdownPreview({ value }: Props) {
  // 在渲染前将 HTML table 转换为 Markdown
  const processedValue = useMemo(() => {
    return convertHtmlTableToMarkdown(value);
  }, [value]);

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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{processedValue}</ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);

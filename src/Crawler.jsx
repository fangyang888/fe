import React, { useState } from "react";

export default function Crawler() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCrawl = async () => {
    if (!url) return;
    setLoading(true);
    setResult("");
    
    try {
      // 这里可以调用后端 API 或使用 CORS 代理
      const response = await fetch(url);
      const text = await response.text();
      setResult(text);
    } catch (error) {
      setResult(`爬取失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>🕷️ 爬虫工具</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="输入要爬取的 URL"
          style={{
            width: "70%",
            padding: "10px",
            fontSize: "16px",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
        <button
          onClick={handleCrawl}
          disabled={loading}
          style={{
            marginLeft: "10px",
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "爬取中..." : "开始爬取"}
        </button>
      </div>

      <div
        style={{
          backgroundColor: "#f5f5f5",
          padding: "15px",
          borderRadius: "4px",
          minHeight: "400px",
          maxHeight: "600px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "monospace",
          fontSize: "14px",
        }}
      >
        {result || "爬取结果将显示在这里..."}
      </div>
    </div>
  );
}

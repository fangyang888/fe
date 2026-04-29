import React, { useState, useEffect } from "react";

/**
 * 历史数据管理页面 - 路由 /history
 * 查看、新增、删除 history 记录
 */
export default function HistoryManager() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState(["", "", "", "", "", "", ""]);
  const [yearInput, setYearInput] = useState(new Date().getFullYear().toString());
  const [noInput, setNoInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState("default");
  const [queryYear, setQueryYear] = useState(new Date().getFullYear());

  const API_BASE = activeTab === "hk" ? "/api/hk/history" : "/api/history";

  // 加载数据
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const url = queryYear ? `${API_BASE}?year=${queryYear}` : API_BASE;
      const res = await fetch(url);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setRecords(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [activeTab, queryYear]);

  // 新增
  const handleAdd = async () => {
    const numbers = inputs.map((n) => parseInt(n.trim(), 10));
    if (numbers.length !== 7 || numbers.some((n) => isNaN(n) || n < 1 || n > 49)) {
      setMsg({ type: "error", text: "请输入7个 1-49 之间的数字" });
      return;
    }
    const payload = { numbers };
    if (yearInput.trim()) payload.year = parseInt(yearInput.trim(), 10);
    if (noInput.trim()) payload.No = parseInt(noInput.trim(), 10);

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("新增失败");
      setInputs(["", "", "", "", "", "", ""]);
      setYearInput(queryYear.toString());
      setNoInput("");
      setMsg({ type: "success", text: "✅ 新增成功" });
      fetchRecords();
    } catch (e) {
      setMsg({ type: "error", text: "❌ " + e.message });
    }
    setSubmitting(false);
  };

  // 删除
  const handleDelete = async (id) => {
    if (!confirm(`确认删除第 ${id} 条记录?`)) return;
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setMsg({ type: "success", text: `✅ 已删除 #${id}` });
      fetchRecords();
    } catch (e) {
      setMsg({ type: "error", text: "❌ " + e.message });
    }
  };

  // 输入框更新
  const handleInputChange = (idx, val) => {
    const next = [...inputs];
    next[idx] = val;
    setInputs(next);
  };

  // Tab/Enter 跳转下一个输入框
  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (idx < 6) {
        document.getElementById(`num-input-${idx + 1}`)?.focus();
      } else {
        handleAdd();
      }
    }
  };

  const styles = {
    container: {
      maxWidth: 800,
      margin: "0 auto",
      padding: "20px 16px",
      fontFamily: "'Inter', 'SF Pro', -apple-system, sans-serif",
      color: "#e8e8e8",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2b 100%)",
    },
    backLink: {
      display: "inline-block",
      marginBottom: 20,
      color: "#64b5f6",
      textDecoration: "none",
      fontSize: 14,
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid rgba(100,181,246,0.3)",
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      marginBottom: 8,
      background: "linear-gradient(135deg, #4fc3f7, #81d4fa)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
    subtitle: { fontSize: 14, color: "#8899aa", marginBottom: 24 },
    tabBtn: {
      padding: "8px 16px",
      borderRadius: "8px",
      border: "none",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s",
    },
    card: {
      background: "rgba(255,255,255,0.05)",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      border: "1px solid rgba(255,255,255,0.08)",
      backdropFilter: "blur(10px)",
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 15,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    inputRow: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center",
      marginBottom: 12,
    },
    input: {
      width: 52,
      height: 40,
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.08)",
      color: "#fff",
      textAlign: "center",
      fontSize: 16,
      fontWeight: 600,
      outline: "none",
    },
    btn: {
      padding: "10px 24px",
      borderRadius: 8,
      border: "none",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer",
      transition: "all 0.2s",
    },
    addBtn: {
      background: "linear-gradient(135deg, #2ecc71, #27ae60)",
      color: "#fff",
    },
    deleteBtn: {
      background: "transparent",
      color: "#e74c3c",
      border: "1px solid rgba(231,76,60,0.3)",
      padding: "4px 12px",
      fontSize: 12,
      borderRadius: 6,
      cursor: "pointer",
    },
    msg: (type) => ({
      padding: "8px 12px",
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 14,
      background: type === "error" ? "rgba(231,76,60,0.15)" : "rgba(46,204,113,0.15)",
      color: type === "error" ? "#e74c3c" : "#2ecc71",
      border: `1px solid ${type === "error" ? "rgba(231,76,60,0.3)" : "rgba(46,204,113,0.3)"}`,
    }),
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 14,
    },
    th: {
      textAlign: "left",
      padding: "10px 8px",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      color: "#8899aa",
      fontWeight: 500,
      fontSize: 12,
    },
    td: {
      padding: "10px 8px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      color: "#d0d0d0",
    },
    numCell: {
      fontWeight: 600,
      color: "#4fc3f7",
      letterSpacing: 1,
    },
  };

  return (
    <div style={styles.container}>
      <a href="/fe" style={styles.backLink}>← 返回主页</a>

      <h1 style={styles.title}>📋 历史数据管理</h1>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button 
          onClick={() => setActiveTab("default")} 
          style={{ 
            ...styles.tabBtn, 
            background: activeTab === "default" ? "linear-gradient(135deg, #4fc3f7, #81d4fa)" : "rgba(255,255,255,0.1)", 
            color: activeTab === "default" ? "#000" : "#fff" 
          }}
        >
          默认数据
        </button>
        <button 
          onClick={() => setActiveTab("hk")} 
          style={{ 
            ...styles.tabBtn, 
            background: activeTab === "hk" ? "linear-gradient(135deg, #4fc3f7, #81d4fa)" : "rgba(255,255,255,0.1)", 
            color: activeTab === "hk" ? "#000" : "#fff" 
          }}
        >
          香港数据
        </button>
      </div>

      <p style={styles.subtitle}>
        当前库：{activeTab === "hk" ? "香港 (hk)" : "默认 (default)"} · {queryYear}年 · 共 {records.length} 条记录 · 支持在线新增和删除
      </p>

      {/* 新增表单 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>➕</span> 新增一行数据
        </div>
        {msg && <div style={styles.msg(msg.type)}>{msg.text}</div>}
        <div style={styles.inputRow}>
          {inputs.map((val, idx) => (
            <input
              key={idx}
              id={`num-input-${idx}`}
              type="number"
              min="1"
              max="49"
              value={val}
              onChange={(e) => handleInputChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              placeholder={`N${idx + 1}`}
              style={styles.input}
            />
          ))}
          <input
            type="number"
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            placeholder="Year"
            style={{ ...styles.input, width: 60 }}
          />
          <input
            type="number"
            value={noInput}
            onChange={(e) => setNoInput(e.target.value)}
            placeholder="No"
            style={{ ...styles.input, width: 60 }}
          />
          <button
            onClick={handleAdd}
            disabled={submitting}
            style={{ ...styles.btn, ...styles.addBtn, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "提交中..." : "新增"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#667788", margin: 0 }}>
          输入 7 个数字（1-49），按 Enter 自动跳转下一格
        </p>
      </div>

      {/* 数据列表 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>📊</span> 数据查询
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#8899aa" }}>年份：</span>
            <input
              type="number"
              value={queryYear}
              onChange={(e) => setQueryYear(parseInt(e.target.value) || "")}
              style={{ ...styles.input, width: 80, height: 32, fontSize: 14 }}
            />
          </div>
        </div>
        {loading ? (
          <p style={{ color: "#8899aa" }}>加载中...</p>
        ) : error ? (
          <p style={{ color: "#e74c3c" }}>❌ {error}（API 未连接，请确保后端已启动）</p>
        ) : records.length === 0 ? (
          <p style={{ color: "#8899aa" }}>暂无数据</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Year</th>
                  <th style={styles.th}>No</th>
                  <th style={styles.th}>号码</th>
                  <th style={styles.th}>时间</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.id}</td>
                    <td style={styles.td}>{r.year || "-"}</td>
                    <td style={styles.td}>{r.No || "-"}</td>
                    <td style={{ ...styles.td, ...styles.numCell }}>
                      {[r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7]
                        .map((n) => String(n).padStart(2, "0"))
                        .join(", ")}
                    </td>
                    <td style={styles.td}>
                      {r.created_at ? new Date(r.created_at).toLocaleString("zh-CN") : "-"}
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleDelete(r.id)}
                        style={styles.deleteBtn}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

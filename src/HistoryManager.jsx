import React, { useState, useEffect } from "react";

const BALL_COLORS = {
  红: { background: "linear-gradient(145deg, #ff6573, #d92d3a)", shadow: "rgba(239, 68, 68, 0.28)" },
  蓝: { background: "linear-gradient(145deg, #65a8ff, #2563c9)", shadow: "rgba(59, 130, 246, 0.28)" },
  绿: { background: "linear-gradient(145deg, #4edb8b, #169456)", shadow: "rgba(34, 197, 94, 0.25)" },
};

const FALLBACK_BALL_COLOR = {
  background: "linear-gradient(145deg, #607086, #39465a)",
  shadow: "rgba(100, 116, 139, 0.2)",
};

const NUMBER_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "2px 0",
  flexWrap: "wrap",
};

function getNumberInfos(record) {
  const value = record.numberInfos ?? record.number_infos;
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function HistoryNumberBall({ number, info, position }) {
  const colorName = info?.color;
  const color = BALL_COLORS[colorName] || FALLBACK_BALL_COLOR;
  const zodiac = info?.zodiac || "--";
  const displayNumber = String(number ?? "--").padStart(2, "0");

  return (
    <div
      title={`第${position}位：${displayNumber}${colorName ? ` · ${colorName}波` : ""}${info?.zodiac ? ` · ${info.zodiac}` : ""}`}
      aria-label={`第${position}位号码 ${displayNumber}，${colorName || "颜色未知"}，生肖${zodiac}`}
      style={{ width: 24, flex: "0 0 24px", textAlign: "center" }}
    >
      <span style={{ display: "block", marginBottom: 2, color: "#67798f", fontSize: 7, lineHeight: 1 }}>
        N{position}
      </span>
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 20,
          height: 20,
          margin: "0 auto",
          borderRadius: "50%",
          background: color.background,
          color: "#fff",
          fontSize: 9,
          fontWeight: 800,
          boxShadow: `0 3px 8px ${color.shadow}, inset 0 1px 1px rgba(255,255,255,0.28)`,
        }}
      >
        {displayNumber}
      </span>
      <span style={{ display: "block", marginTop: 3, color: info?.zodiac ? "#cbd5e1" : "#64748b", fontSize: 9 }}>
        {zodiac}
      </span>
    </div>
  );
}

function HistoryNumberList({ record }) {
  const infos = getNumberInfos(record);
  const numbers = [record.n1, record.n2, record.n3, record.n4, record.n5, record.n6, record.n7];

  return (
    <div style={NUMBER_ROW_STYLE}>
      {numbers.map((number, index) => (
        <HistoryNumberBall
          key={`${record.id}-${index}`}
          number={number}
          info={infos[index]}
          position={index + 1}
        />
      ))}
    </div>
  );
}

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
  const [syncing, setSyncing] = useState(null);
  const [cacheAction, setCacheAction] = useState(null);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState("default");
  const [queryYear, setQueryYear] = useState(new Date().getFullYear());

  const API_BASE = activeTab === "hk" ? "/api/hk/history" : "/api/history";

  const getErrorMessage = async (res, fallback) => {
    const text = await res.text();
    if (!text) return fallback;
    try {
      const data = JSON.parse(text);
      return data.message || data.error || fallback;
    } catch {
      return text || fallback;
    }
  };

  // 加载数据
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const url = queryYear ? `${API_BASE}?year=${queryYear}` : API_BASE;
      const res = await fetch(url);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      const sortedRecords = Array.isArray(data)
        ? [...data].sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(b.No || 0) - Number(a.No || 0))
        : [];
      setRecords(sortedRecords);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [activeTab, queryYear]);

  const cacheActions = [
    {
      key: "killSeven",
      label: "生成 /kill/seven 缓存",
      endpoint: "/api/predictor/kill-seven/cache/refresh",
      success: "/kill/seven 缓存已生成",
      error: "/kill/seven 缓存生成失败",
    },
    {
      key: "hotPick",
      label: `生成 HotPick${activeTab === "hk" ? " 香港" : ""} 缓存`,
      endpoints: [
        `/api/predictor/hot-pick/cache/refresh${activeTab === "hk" ? "?type=hk" : ""}`,
        `/api/predictor-opt/hot-pick/cache/refresh${activeTab === "hk" ? "?type=hk" : ""}`,
      ],
      success: `HotPick${activeTab === "hk" ? " 香港" : ""} 缓存已生成`,
      error: "/hot-pick 缓存生成失败",
    },
    {
      key: "killNew",
      label: "生成 /kill/new 缓存",
      endpoint: "/api/predictor/kill/cache/refresh",
      success: "/kill/new 缓存已生成",
      error: "/kill/new 缓存生成失败",
    },
    {
      key: "hybrid47",
      label: "生成 /kill/hybrid-4-7 缓存",
      endpoint: "/api/fixed-hybrid-kill/probability-4-7/cache/refresh",
      success: "/kill/hybrid-4-7 缓存已生成",
      error: "/kill/hybrid-4-7 缓存生成失败",
    },
    {
      key: "fivePeriod",
      label: `生成 /kill/five-period${activeTab === "hk" ? " 香港" : ""} 缓存`,
      endpoint: `/api/five-period-kill/cache/refresh?minSamples=8${activeTab === "hk" ? "&type=hk" : ""}`,
      success: `/kill/five-period${activeTab === "hk" ? " 香港" : ""} 缓存已生成`,
      error: "/kill/five-period 缓存生成失败",
    },
    {
      key: "killOne",
      label: `生成 /kill/one${activeTab === "hk" ? " 香港" : ""} 缓存`,
      endpoint: `/api/kill-one/cache/refresh?backtest=50${activeTab === "hk" ? "&type=hk" : ""}`,
      success: `/kill/one${activeTab === "hk" ? " 香港" : ""} 缓存已生成`,
      error: "/kill/one 缓存生成失败",
    },
    {
      key: "pOneKill",
      label: `生成 /kill/p_one${activeTab === "hk" ? " 香港" : ""} 缓存`,
      endpoint: `/api/kill/p-one/cache/refresh${activeTab === "hk" ? "?type=hk" : ""}`,
      success: `/kill/p_one${activeTab === "hk" ? " 香港" : ""} 缓存已生成`,
      error: "/kill/p_one 缓存生成失败",
    },
    {
      key: "killCombo",
      label: "生成 /kill/combo 回测缓存",
      endpoint: "/api/kill-combo/cache/refresh?count=20&a=HC1&b=S2",
      success: "/kill/combo 回测缓存已生成",
      error: "/kill/combo 回测缓存生成失败",
    },
  ];

  const generateCache = async (action) => {
    setCacheAction(action.key);
    setMsg(null);
    try {
      const endpoints = action.endpoints || [action.endpoint];
      const results = [];
      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await getErrorMessage(res, action.error));
        results.push(await res.json());
      }
      const stores = results
        .map((data) => data.cacheMeta?.store)
        .filter(Boolean);
      const store = stores.length ? `（${[...new Set(stores)].join(" + ")}）` : "";
      setMsg({ type: "success", text: `✅ ${action.success}${store}` });
    } catch (e) {
      setMsg({ type: "error", text: "❌ " + e.message });
    } finally {
      setCacheAction(null);
    }
  };

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
    if (
      payload.year !== undefined &&
      payload.No !== undefined &&
      records.some((r) => r.year === payload.year && r.No === payload.No)
    ) {
      setMsg({ type: "error", text: `第 ${payload.year} 年第 ${payload.No} 期数据已存在` });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "新增失败"));
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

  const handleSync = async (mode) => {
    const year = parseInt(queryYear || yearInput, 10);
    if (!Number.isInteger(year)) {
      setMsg({ type: "error", text: "请输入要同步的年份" });
      return;
    }

    setSyncing(mode);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/${mode === "year" ? "sync-year" : "sync-latest"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "同步失败"));
      const data = await res.json();
      if (mode === "year") {
        setMsg({
          type: "success",
          text: `✅ ${year}年同步完成：抓取 ${data.fetched} 期，新增 ${data.inserted} 期，更新 ${data.updated || 0} 期，忽略未变 ${data.skipped} 期`,
        });
      } else {
        setMsg({
          type: data.inserted > 0 ? "success" : "error",
          text: `${data.inserted > 0 ? "✅" : "ℹ️"} ${data.message || `新增 ${data.inserted} 期，忽略 ${data.skipped} 期`}`,
        });
      }
      fetchRecords();
    } catch (e) {
      setMsg({ type: "error", text: "❌ " + e.message });
    } finally {
      setSyncing(null);
    }
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
      maxWidth: 1100,
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
      flexWrap: "wrap",
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
    syncBtn: {
      background: "linear-gradient(135deg, #3498db, #2980b9)",
      color: "#fff",
    },
    cacheBtn: {
      background: "linear-gradient(135deg, #8e44ad, #6c5ce7)",
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
    legend: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      marginLeft: 12,
      color: "#8899aa",
      fontSize: 11,
    },
    recordList: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: 8,
    },
    recordItem: {
      padding: "11px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.035)",
      contentVisibility: "auto",
      containIntrinsicSize: "68px",
    },
    recordHead: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    },
    recordPeriod: {
      display: "block",
      color: "#f1f5f9",
      fontSize: 13,
      fontWeight: 700,
    },
    recordTime: {
      display: "block",
      marginTop: 2,
      color: "#66778b",
      fontSize: 9,
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
      {msg && <div style={styles.msg(msg.type)}>{msg.text}</div>}

      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>🔄</span> 数据同步
        </div>
        <div style={styles.inputRow}>
          <button
            onClick={() => handleSync("year")}
            disabled={Boolean(syncing)}
            style={{ ...styles.btn, ...styles.syncBtn, opacity: syncing ? 0.6 : 1 }}
          >
            {syncing === "year" ? "同步中..." : `同步${queryYear}全年`}
          </button>
          <button
            onClick={() => handleSync("latest")}
            disabled={Boolean(syncing)}
            style={{ ...styles.btn, ...styles.syncBtn, opacity: syncing ? 0.6 : 1 }}
          >
            {syncing === "latest" ? "同步中..." : "同步最后一期"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#667788", margin: 0 }}>
          当前同步源：{activeTab === "hk" ? "香港数据 hkUrl" : "默认数据"}；如果 year + No 已存在会自动忽略。同步数据不会自动刷新 Redis 缓存。
        </p>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>⚡</span> 页面缓存
        </div>
        <div style={styles.inputRow}>
          {cacheActions.map((action) => (
            <button
              key={action.key}
              onClick={() => generateCache(action)}
              disabled={Boolean(cacheAction)}
              style={{ ...styles.btn, ...styles.cacheBtn, opacity: cacheAction ? 0.6 : 1 }}
            >
              {cacheAction === action.key ? "生成中..." : action.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#667788", margin: 0 }}>
          手动生成 Redis 缓存；新增或同步数据后，如需页面立刻变快，请在这里按需生成对应缓存。
        </p>
      </div>

      {/* 新增表单 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span>➕</span> 新增一行数据
        </div>
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span>📊</span> 数据查询
          </span>
          {activeTab === "default" && (
            <div style={styles.legend} aria-label="号码颜色图例">
              {Object.keys(BALL_COLORS).map((colorName) => (
                <span key={colorName} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <i
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: BALL_COLORS[colorName].background,
                    }}
                  />
                  {colorName}波
                </span>
              ))}
            </div>
          )}
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
          <div style={styles.recordList}>
            {records.map((r) => (
              <article key={r.id} style={styles.recordItem}>
                <div style={styles.recordHead}>
                  <div>
                    <strong style={styles.recordPeriod}>
                      {r.year || "-"}年 · 第{r.No || "-"}期
                    </strong>
                    <span style={styles.recordTime}>
                      {r.created_at ? new Date(r.created_at).toLocaleString("zh-CN") : "时间未知"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    style={styles.deleteBtn}
                  >
                    删除
                  </button>
                </div>
                <HistoryNumberList record={r} />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

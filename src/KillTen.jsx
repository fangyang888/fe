import React, { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

/**
 * 十码全杀 - 路由 /kill/ten
 * 预测下期不会出现的 10 个号码，并展示近十期回测
 */
export default function KillTen() {
  const [dataType, setDataType] = useState('default');
  const [killCount, setKillCount] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (signal) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/kill-ten?type=${dataType}&killCount=${killCount}`, {
        cache: 'no-store',
        signal,
      });
      if (!res.ok) throw new Error(`接口返回 ${res.status}`);
      setData(await res.json());
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [dataType, killCount]);

  const refreshCache = async () => {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`/api/kill-ten/cache/refresh?type=${dataType}&killCount=${killCount}`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`接口返回 ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const prediction = data?.prediction;
  const backtest = data?.backtest;
  const walkForward = data?.walkForwardBacktest;
  const trainedModels = data?.trainedModels || [];
  const targetMet = data?.status === 'target-met';
  const latest = data?.historyMeta?.latest;

  const styles = {
    container: {
      maxWidth: 900,
      margin: '0 auto',
      padding: '20px 16px',
      fontFamily: "'Inter', 'SF Pro', -apple-system, sans-serif",
      color: '#e8e8e8',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2b 100%)',
    },
    backLink: {
      display: 'inline-block',
      marginBottom: 20,
      color: '#64b5f6',
      textDecoration: 'none',
      fontSize: 14,
      padding: '6px 12px',
      borderRadius: 6,
      border: '1px solid rgba(100,181,246,0.3)',
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      marginBottom: 8,
      background: 'linear-gradient(135deg, #ef5350, #ff8a80)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    card: {
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      border: '1px solid rgba(255,255,255,0.08)',
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 15,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    ball: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #c62828, #e53935)',
      color: '#fff',
      fontWeight: 700,
      fontSize: 16,
      marginRight: 8,
      marginBottom: 8,
      boxShadow: '0 4px 12px rgba(229,57,53,0.4)',
    },
    topBall: {
      background: 'linear-gradient(135deg, #f9a825, #ffd54f)',
      color: '#3e2700',
      boxShadow: '0 0 0 2px rgba(255,213,79,0.9), 0 4px 14px rgba(249,168,37,0.55)',
      position: 'relative',
    },
    topNum: {
      color: '#ffd54f',
      fontWeight: 700,
      textShadow: '0 0 8px rgba(255,213,79,0.45)',
    },
    badge: (ok) => ({
      padding: '4px 12px',
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 600,
      background: ok ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
      color: ok ? '#2ecc71' : '#e74c3c',
      border: `1px solid ${ok ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)'}`,
    }),
    tabBtn: (active) => ({
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      fontWeight: 600,
      cursor: 'pointer',
      background: active ? 'linear-gradient(135deg, #4fc3f7, #81d4fa)' : 'rgba(255,255,255,0.1)',
      color: active ? '#000' : '#fff',
    }),
    btn: {
      padding: '8px 16px',
      borderRadius: 8,
      border: 'none',
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer',
      background: 'linear-gradient(135deg, #8e44ad, #6c5ce7)',
      color: '#fff',
    },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: {
      textAlign: 'left',
      padding: '8px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      color: '#8899aa',
      fontWeight: 500,
      fontSize: 12,
    },
    td: {
      padding: '8px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      color: '#d0d0d0',
    },
    note: { fontSize: 12, color: '#667788', lineHeight: 1.6, margin: 0 },
  };

  return (
    <div style={styles.container}>
      <a href="/fe" style={styles.backLink}>← 返回主页</a>
      <h1 style={styles.title}>🚫 杀码全中（真实滚动回测）</h1>
      <p style={{ fontSize: 14, color: '#8899aa', marginBottom: 16 }}>
        预测下期不会出现的 {killCount} 个号码 · 近20期真实滚动回测 ·{' '}
        {latest ? `最新：${latest.year || ''}年第 ${latest.No || latest.id || '--'} 期` : '--'}
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={styles.tabBtn(dataType === 'default')} onClick={() => setDataType('default')}>
          默认数据
        </button>
        <button style={styles.tabBtn(dataType === 'hk')} onClick={() => setDataType('hk')}>
          香港数据
        </button>
        <label style={{ fontSize: 13, color: '#8899aa' }}>
          杀码数量：
          <select
            value={killCount}
            onChange={(e) => setKillCount(parseInt(e.target.value, 10))}
            style={{
              marginLeft: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (
              <option key={k} value={k} style={{ color: '#000' }}>{k} 码</option>
            ))}
          </select>
        </label>
        <button style={{ ...styles.btn, opacity: refreshing ? 0.6 : 1 }} onClick={refreshCache} disabled={refreshing}>
          {refreshing ? '刷新中...' : '强制重算缓存'}
        </button>
      </div>

      {error && (
        <div style={{ ...styles.card, color: '#e74c3c' }}>❌ {error}（请确保后端已启动）</div>
      )}
      {loading && <div style={styles.card}>加载中...</div>}

      {!loading && !error && data && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitle}>
              <span>🎯</span> 下期杀{killCount}码
              <span style={styles.badge(targetMet)}>
                真实滚动近{walkForward?.count ?? 20}期 {fmtPct(walkForward?.successRate)}
              </span>
              <span style={{ ...styles.badge(true), background: 'rgba(100,181,246,0.15)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.4)' }}>
                理论期望 {fmtPct(data?.theoreticalRate)}/期
              </span>
            </div>
            <div>
              {(prediction?.numbers || []).map((n) => (
                <span key={n} style={styles.ball}>{fmtNum(n)}</span>
              ))}
            </div>
            <p style={styles.note}>
              选号逻辑：在最近 {prediction?.lookback ?? 20} 期中精确求解“被命中期数最少”的{' '}
              {killCount} 码组合，遗漏期数越长越优先。理论期望 = C({49 - killCount},7)/C(49,7)，
              真实滚动回测会围绕该值波动，与算法无关。
            </p>
          </div>

          {trainedModels.map((m) => (
            <div style={styles.card} key={m.key}>
              <div style={styles.cardTitle}>
                <span>🧪</span> {m.name} · 杀{m.killCount}码
                <span style={styles.badge(m.backtest?.successRate >= 0.9)}>
                  近{m.backtest?.count}期3码全杀 {m.backtest?.successCount}/{m.backtest?.count} ·{' '}
                  {fmtPct(m.backtest?.successRate)}
                </span>
                <span style={{ ...styles.badge(true), background: 'rgba(255,213,79,0.12)', color: '#ffd54f', border: '1px solid rgba(255,213,79,0.4)' }}>
                  ★ Top1单杀 {m.backtest?.topSuccessCount}/{m.backtest?.count} ·{' '}
                  {fmtPct(m.backtest?.topSuccessRate)}（随机 85.7%）
                </span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#8899aa', marginRight: 8 }}>下期预测：</span>
                {(m.prediction?.numbers || []).map((n) => (
                  <span
                    key={n}
                    title={n === m.prediction?.topNumber ? '模型最有把握的1码' : undefined}
                    style={{
                      ...styles.ball,
                      width: 38,
                      height: 38,
                      fontSize: 14,
                      ...(n === m.prediction?.topNumber ? styles.topBall : null),
                    }}
                  >
                    {n === m.prediction?.topNumber ? '★' : ''}{fmtNum(n)}
                  </span>
                ))}
                <span style={{ fontSize: 12, color: '#8899aa' }}>
                  ★ = 该模型本期分数最高的一杀
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>期号</th>
                      <th style={styles.th}>预测杀码（你预测的值）</th>
                      <th style={styles.th}>开奖号码</th>
                      <th style={styles.th}>被命中杀码</th>
                      <th style={styles.th}>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.backtest?.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                        <td style={{ ...styles.td, color: '#ff8a80' }}>
                          {(r.predictedKillNumbers || []).map((n, j) => (
                            <span key={n}>
                              {j > 0 ? ', ' : ''}
                              <span
                                title={n === r.topKillNumber ? '模型最有把握的1码' : undefined}
                                style={n === r.topKillNumber ? styles.topNum : undefined}
                              >
                                {n === r.topKillNumber ? '★' : ''}{fmtNum(n)}
                              </span>
                            </span>
                          ))}
                        </td>
                        <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                          {(r.actualNumbers || []).map(fmtNum).join(', ')}
                        </td>
                        <td style={{ ...styles.td, color: '#e74c3c' }}>
                          {(r.appearedKillNumbers || []).length
                            ? r.appearedKillNumbers.map(fmtNum).join(', ')
                            : '—'}
                        </td>
                        <td style={styles.td}>
                          {r.allKilled ? '✅ 全杀成功' : '❌ 杀错'}
                          {r.topKillSuccess === false ? ' (★被开出)' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ ...styles.note, marginTop: 10 }}>
                该模型是 40 万个随机特征加权模型中、在 20 期训练窗口做到 100% 的模型之一（权重已固定）。
                此处为真实滚动回测：每期只用该期之前的数据计算特征。理论期望 62.3%/期。
              </p>
            </div>
          ))}

          <div style={styles.card}>
            <div style={styles.cardTitle}>
              <span>📊</span> 近{walkForward?.count ?? 20}期真实滚动回测（每期只用之前数据选号）
              <span style={styles.badge(targetMet)}>
                {walkForward?.successCount}/{walkForward?.count} 全中 · {fmtPct(walkForward?.successRate)}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>期号</th>
                    <th style={styles.th}>预测杀码（你预测的值）</th>
                    <th style={styles.th}>开奖号码</th>
                    <th style={styles.th}>被命中杀码</th>
                    <th style={styles.th}>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {(walkForward?.rows || []).map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                      <td style={{ ...styles.td, color: '#ff8a80' }}>
                        {(r.predictedKillNumbers || []).map(fmtNum).join(', ')}
                      </td>
                      <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                        {(r.actualNumbers || []).map(fmtNum).join(', ')}
                      </td>
                      <td style={{ ...styles.td, color: '#e74c3c' }}>
                        {(r.appearedKillNumbers || []).length
                          ? r.appearedKillNumbers.map(fmtNum).join(', ')
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        {r.allKilled ? '✅ 全杀成功' : '❌ 杀错'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>
              <span>🔍</span> 固定集参考（事后口径，仅供对照，勿当真实概率）
              <span style={styles.badge(false)}>
                {backtest?.successCount}/{backtest?.count} 全中 · {fmtPct(backtest?.successRate)}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>期号</th>
                    <th style={styles.th}>预测杀码（你预测的值）</th>
                    <th style={styles.th}>开奖号码</th>
                    <th style={styles.th}>被命中杀码</th>
                    <th style={styles.th}>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {(backtest?.rows || []).map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                      <td style={{ ...styles.td, color: '#ff8a80' }}>
                        {(r.predictedKillNumbers || []).map(fmtNum).join(', ')}
                      </td>
                      <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                        {(r.actualNumbers || []).map(fmtNum).join(', ')}
                      </td>
                      <td style={{ ...styles.td, color: '#e74c3c' }}>
                        {(r.appearedKillNumbers || []).length
                          ? r.appearedKillNumbers.map(fmtNum).join(', ')
                          : '—'}
                      </td>
                      <td style={styles.td}>
                        {r.allKilled ? '✅ 全杀成功' : '❌ 杀错'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ ...styles.note, marginTop: 12 }}>{data?.note}</p>
          </div>
        </>
      )}
    </div>
  );
}

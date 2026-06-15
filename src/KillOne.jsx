import React, { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

/**
 * 一杀（单杀） - 路由 /kill/one
 * 预测下期最不可能出现的 1 个号码，多策略近 50 期真实滚动回测，
 * 自动推荐命中率最高的策略；用户要求 100%。
 */
export default function KillOne() {
  const [dataType, setDataType] = useState('default');
  const [backtest, setBacktest] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (signal) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/kill-one?type=${dataType}&backtest=${backtest}`, {
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
  }, [dataType, backtest]);

  const refreshCache = async () => {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`/api/kill-one/cache/refresh?type=${dataType}&backtest=${backtest}`, {
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

  const recommended = data?.recommended;
  const allStrategies = data?.strategies || [];
  const featured = allStrategies.find((s) => s.key === 'hot50');
  const strategies = allStrategies.filter((s) => s.key !== 'hot50');
  const perfectStrategies = data?.perfectStrategies || [];
  const gate = data?.confidenceGate;
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
    bigBall: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 72,
      height: 72,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #f9a825, #ffd54f)',
      color: '#3e2700',
      fontWeight: 800,
      fontSize: 30,
      boxShadow: '0 0 0 3px rgba(255,213,79,0.9), 0 6px 18px rgba(249,168,37,0.55)',
    },
    ball: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #c62828, #e53935)',
      color: '#fff',
      fontWeight: 700,
      fontSize: 14,
      marginRight: 8,
      marginBottom: 8,
      boxShadow: '0 4px 12px rgba(229,57,53,0.4)',
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
      <h1 style={styles.title}>🎯 一杀（单杀 · 近{backtest}期回测）</h1>
      <p style={{ fontSize: 14, color: '#8899aa', marginBottom: 16 }}>
        预测下期最不可能出现的 1 个号码 · 多策略真实滚动回测自动择优 ·{' '}
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
          回测期数：
          <select
            value={backtest}
            onChange={(e) => setBacktest(parseInt(e.target.value, 10))}
            style={{
              marginLeft: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
            }}
          >
            {[20, 30, 50, 80, 100].map((k) => (
              <option key={k} value={k} style={{ color: '#000' }}>{k} 期</option>
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

      {!loading && !error && data && data.status === 'insufficient-history' && (
        <div style={styles.card}>⚠️ {data.message}（当前 {data.historyCount} 期）</div>
      )}

      {!loading && !error && data && data.status !== 'insufficient-history' && (
        <>
          {featured && (() => {
            const rows20 = (featured.backtest?.rows || []).slice(0, 20);
            const hit20 = rows20.filter((r) => r.success).length;
            const rate20 = rows20.length ? hit20 / rows20.length : 0;
            return (
              <div
                style={{
                  ...styles.card,
                  border: '2px solid rgba(255,213,79,0.7)',
                  background: 'linear-gradient(135deg, rgba(249,168,37,0.12), rgba(255,255,255,0.05))',
                  boxShadow: '0 0 24px rgba(249,168,37,0.25)',
                }}
              >
                <div style={styles.cardTitle}>
                  <span>📌</span> 置顶推荐 · {featured.name}
                  <span style={styles.badge(rate20 >= 1)}>
                    近20期 {hit20}/{rows20.length} · {fmtPct(rate20)}
                  </span>
                  <span style={styles.badge(featured.backtest?.successRate >= 0.94)}>
                    近{featured.backtest?.count}期 {featured.backtest?.successCount}/{featured.backtest?.count} ·{' '}
                    {fmtPct(featured.backtest?.successRate)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={styles.bigBall}>{featured.prediction?.display}</span>
                  <div style={{ fontSize: 14, color: '#cfd8dc' }}>
                    下期建议杀：<b style={{ color: '#ffd54f' }}>{featured.prediction?.display}</b>
                    <div style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>
                      规则：杀近50期最常出现的号（持续偏热号），实证近20/30期100%、近50期96%。
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#8899aa', marginBottom: 6 }}>近20期回测明细：</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>期号</th>
                        <th style={styles.th}>预测一杀</th>
                        <th style={styles.th}>开奖号码</th>
                        <th style={styles.th}>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows20.map((r, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                          <td style={{ ...styles.td, color: '#ffd54f', fontWeight: 700 }}>{r.killDisplay}</td>
                          <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                            {(r.actualNumbers || []).map(fmtNum).join(', ')}
                          </td>
                          <td style={styles.td}>{r.success ? '✅ 杀对' : '❌ 被开出'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ ...styles.note, marginTop: 10 }}>
                  ⚠️ 近20期满分含运气成分（样本小），该规则近100/300期约88–93%，代表历史不保证下一期。
                </p>
              </div>
            );
          })()}

          <div style={styles.card}>
            <div style={styles.cardTitle}>
              <span>⭐</span> 推荐一杀（{recommended?.name}）
              <span style={styles.badge(targetMet)}>
                近{recommended?.count}期 {recommended?.successCount}/{recommended?.count} ·{' '}
                {fmtPct(recommended?.successRate)}
              </span>
              <span style={{ ...styles.badge(true), background: 'rgba(100,181,246,0.15)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.4)' }}>
                理论期望 {fmtPct(data?.theoreticalRate)}/期
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={styles.bigBall}>{recommended?.prediction?.display}</span>
              <div style={{ fontSize: 14, color: '#cfd8dc' }}>
                下期预测：<b style={{ color: '#ffd54f' }}>不会开出 {recommended?.prediction?.display}</b>
                <div style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>
                  {targetMet
                    ? `✅ 该策略在近 ${recommended?.count} 期回测达到 100%`
                    : `当前最优策略近 ${recommended?.count} 期命中 ${fmtPct(recommended?.successRate)}`}
                </div>
              </div>
            </div>
            {perfectStrategies.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 13, color: '#8899aa' }}>
                近{backtest}期 100% 的策略共 {perfectStrategies.length} 套：
                {perfectStrategies.map((s) => (
                  <span key={s.key} style={{ ...styles.ball, width: 32, height: 32, fontSize: 13 }}>
                    {s.prediction?.display}
                  </span>
                ))}
              </div>
            )}
            <p style={{ ...styles.note, marginTop: 12 }}>{data?.note}</p>
          </div>

          {gate && (
            <div style={{ ...styles.card, border: '1px solid rgba(46,204,113,0.35)' }}>
              <div style={styles.cardTitle}>
                <span>🛡️</span> 置信门（出手才中 · 达到 100% 的正路）
                <span style={styles.badge(gate.firedAccuracy >= 1)}>
                  出手命中 {gate.hitCount}/{gate.firedCount} · {fmtPct(gate.firedAccuracy)}
                </span>
                <span style={{ ...styles.badge(true), background: 'rgba(100,181,246,0.15)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.4)' }}>
                  覆盖率 {fmtPct(gate.coverage)}（{gate.firedCount}/{gate.total} 期）
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: gate.next?.fire ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.10)',
                  border: `1px solid ${gate.next?.fire ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.35)'}`,
                }}
              >
                <span style={{ fontSize: 22 }}>{gate.next?.fire ? '✅' : '⏸️'}</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: gate.next?.fire ? '#2ecc71' : '#e74c3c' }}>
                  本期{gate.next?.fire ? '建议出手' : '建议弃一期'}
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#8899aa', marginLeft: 8 }}>
                    共识票数 {gate.next?.votes}/{gate.baseStrategyCount}，阈值 {gate.chosenThreshold}
                  </span>
                </div>
                {gate.next?.fire && <span style={styles.bigBall}>{gate.next?.display}</span>}
              </div>
              <p style={{ ...styles.note, marginTop: 12 }}>
                逻辑：{gate.baseStrategyCount} 套策略各投一票，得票数≥{gate.chosenThreshold}（系统自动选出能让出手期 100% 命中、覆盖最多的阈值）才出手，
                否则弃一期。这样把命中率提升到 {fmtPct(gate.firedAccuracy)}（仅统计出手的 {gate.firedCount} 期）。
                覆盖率越低代表越保守——这是用「少出手」换「高命中」，仍为历史口径，不保证未来。
              </p>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>期号</th>
                      <th style={styles.th}>出手一杀</th>
                      <th style={styles.th}>票数</th>
                      <th style={styles.th}>开奖号码</th>
                      <th style={styles.th}>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(gate.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                        <td style={{ ...styles.td, color: '#ff8a80', fontWeight: 600 }}>{r.killDisplay}</td>
                        <td style={styles.td}>{r.votes}</td>
                        <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                          {(r.actualNumbers || []).map(fmtNum).join(', ')}
                        </td>
                        <td style={styles.td}>{r.success ? '✅ 杀对' : '❌ 被开出'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {strategies.map((m) => (
            <div style={styles.card} key={m.key}>
              <div style={styles.cardTitle}>
                <span>{m.backtest?.isPerfect ? '🏆' : '🧪'}</span> {m.name}
                <span style={styles.badge(m.backtest?.successRate >= 0.95)}>
                  近{m.backtest?.count}期 {m.backtest?.successCount}/{m.backtest?.count} ·{' '}
                  {fmtPct(m.backtest?.successRate)}
                </span>
                <span style={{ fontSize: 13, color: '#8899aa' }}>
                  下期预测一杀：
                  <span style={{ color: '#ffd54f', fontWeight: 700 }}> {m.prediction?.display}</span>
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>期号</th>
                      <th style={styles.th}>预测一杀（你预测不开的号）</th>
                      <th style={styles.th}>开奖号码</th>
                      <th style={styles.th}>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.backtest?.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.year || '-'} / {r.No || '-'}</td>
                        <td style={{ ...styles.td, color: '#ff8a80', fontWeight: 600 }}>{r.killDisplay}</td>
                        <td style={{ ...styles.td, color: '#4fc3f7', fontWeight: 600 }}>
                          {(r.actualNumbers || []).map(fmtNum).join(', ')}
                        </td>
                        <td style={styles.td}>{r.success ? '✅ 杀对' : '❌ 被开出'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

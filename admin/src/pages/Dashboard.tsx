import { useEffect, useState, useCallback } from 'react'
import { getOverview, Overview } from '../api/stat'
import { ApiError } from '../api/client'

const today = () => new Date().toISOString().slice(0, 10)

// 转化漏斗的事件顺序
const FUNNEL: { key: string; label: string }[] = [
  { key: 'product_detail_view', label: '商品曝光' },
  { key: 'add_to_cart', label: '加入购物车' },
  { key: 'checkout_start', label: '进入结算' },
  { key: 'order_submit', label: '提交订单' },
]

export default function Dashboard() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getOverview(date))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const countOf = (name: string) =>
    data?.events.find((e) => e.eventName === name)?.count || 0

  const funnel = FUNNEL.map((f) => ({ ...f, count: countOf(f.key) }))
  const funnelMax = Math.max(1, ...funnel.map((f) => f.count))

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">数据看板</h2>
        <div className="page-actions">
          <input
            className="search-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="primary-btn" onClick={load}>
            刷新
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* 指标卡 */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">PV 访问量</div>
          <div className="metric-value">{loading ? '-' : data?.pv ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">UV 独立访客</div>
          <div className="metric-value">{loading ? '-' : data?.uv ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">下单数</div>
          <div className="metric-value">
            {loading ? '-' : countOf('order_submit')}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">加购数</div>
          <div className="metric-value">
            {loading ? '-' : countOf('add_to_cart')}
          </div>
        </div>
      </div>

      {/* 转化漏斗 */}
      <div className="panel">
        <h3 className="panel-title">转化漏斗</h3>
        <div className="funnel">
          {funnel.map((f, i) => {
            const prev = i === 0 ? f.count : funnel[i - 1].count
            const rate = prev > 0 ? Math.round((f.count / prev) * 100) : 0
            return (
              <div className="funnel-row" key={f.key}>
                <div className="funnel-label">{f.label}</div>
                <div className="funnel-bar-wrap">
                  <div
                    className="funnel-bar"
                    style={{
                      width: `${Math.max(4, (f.count / funnelMax) * 100)}%`,
                    }}
                  >
                    <span className="funnel-count">{f.count}</span>
                  </div>
                </div>
                <div className="funnel-rate">
                  {i === 0 ? '—' : `${rate}%`}
                </div>
              </div>
            )
          })}
        </div>
        <p className="funnel-note">
          右侧为相对上一环节的转化率;整体转化率(曝光→下单):
          {funnel[0].count > 0
            ? ` ${Math.round((funnel[3].count / funnel[0].count) * 100)}%`
            : ' —'}
        </p>
      </div>

      {/* 全部事件 */}
      <div className="panel">
        <h3 className="panel-title">事件明细</h3>
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>事件</th>
                <th>次数</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.events.length === 0 ? (
                <tr>
                  <td colSpan={2} className="table-empty">
                    当日暂无埋点数据
                  </td>
                </tr>
              ) : (
                data.events
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((e) => (
                    <tr key={e.eventName}>
                      <td>{e.eventName}</td>
                      <td>{e.count}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

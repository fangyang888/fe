import { useEffect, useState, useCallback } from 'react'
import {
  getOrders,
  updateOrderStatus,
  Order,
  OrderStatus,
  ORDER_STATUS_TEXT,
} from '../api/order'
import { ApiError } from '../api/client'

const FILTERS: { key: OrderStatus | ''; text: string }[] = [
  { key: '', text: '全部' },
  { key: 'unpaid', text: '待付款' },
  { key: 'unshipped', text: '待发货' },
  { key: 'shipping', text: '待收货' },
  { key: 'unreviewed', text: '待评价' },
  { key: 'completed', text: '已完成' },
  { key: 'after_sale', text: '售后中' },
]

export default function Orders() {
  const [rows, setRows] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getOrders(page, pageSize, status)
      setRows(res.list)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => {
    load()
  }, [load])

  const ship = async (o: Order) => {
    if (!confirm(`订单 ${o.orderNo} 标记为已发货?`)) return
    try {
      await updateOrderStatus(o.id, 'shipping')
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  const close = async (o: Order) => {
    if (!confirm(`关闭订单 ${o.orderNo}?`)) return
    try {
      await updateOrderStatus(o.id, 'closed')
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">订单管理</h2>
        <span className="page-count">共 {total} 笔订单</span>
      </div>

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            className={'filter-btn' + (status === f.key ? ' active' : '')}
            onClick={() => {
              setStatus(f.key)
              setPage(1)
            }}
          >
            {f.text}
          </button>
        ))}
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>用户ID</th>
              <th>商品</th>
              <th>金额</th>
              <th>状态</th>
              <th>下单时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>{o.userId}</td>
                  <td className="cell-name">
                    {o.items?.[0]?.name}
                    {o.items && o.items.length > 1
                      ? ` 等${o.items.length}件`
                      : ''}
                  </td>
                  <td>¥{o.totalAmount}</td>
                  <td>
                    <span className="badge badge-info">
                      {ORDER_STATUS_TEXT[o.status]}
                    </span>
                  </td>
                  <td>{o.created_at?.slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    {o.status === 'unshipped' && (
                      <button className="row-btn" onClick={() => ship(o)}>
                        发货
                      </button>
                    )}
                    {o.status === 'unpaid' && (
                      <button
                        className="row-btn danger"
                        onClick={() => close(o)}
                      >
                        关闭
                      </button>
                    )}
                    {!['unshipped', 'unpaid'].includes(o.status) && (
                      <span className="cell-muted">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          className="pager-btn"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span className="pager-info">
          {page} / {totalPages}
        </span>
        <button
          className="pager-btn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}

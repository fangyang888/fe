import { useEffect, useState, useCallback } from 'react'
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  Coupon,
  CouponInput,
} from '../api/cms'
import { ApiError } from '../api/client'

const EMPTY: CouponInput = {
  name: '',
  type: 'amount',
  value: 0,
  minSpend: 0,
  expireAt: '',
  status: 1,
}

export default function Coupons() {
  const [rows, setRows] = useState<Coupon[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; id?: number }>({
    open: false,
  })
  const [form, setForm] = useState<CouponInput>(EMPTY)

  const load = useCallback(async () => {
    setError('')
    try {
      setRows(await getCoupons())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY)
    setModal({ open: true })
  }
  const openEdit = (c: Coupon) => {
    setForm({
      name: c.name,
      type: c.type,
      value: c.value,
      minSpend: c.minSpend,
      expireAt: c.expireAt ? c.expireAt.slice(0, 10) : '',
      status: c.status,
    })
    setModal({ open: true, id: c.id })
  }
  const setField = (k: keyof CouponInput, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return alert('请填写券名')
    const payload = {
      ...form,
      expireAt: form.expireAt ? `${form.expireAt} 23:59:59` : undefined,
    }
    try {
      if (modal.id) await updateCoupon(modal.id, payload)
      else await createCoupon(payload)
      setModal({ open: false })
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }
  const remove = async (c: Coupon) => {
    if (!confirm(`删除优惠券「${c.name}」?`)) return
    try {
      await deleteCoupon(c.id)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  const valueText = (c: Coupon) =>
    c.type === 'amount' ? `减 ¥${c.value}` : `${(c.value / 10).toFixed(1)} 折`

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">优惠券管理</h2>
        <span className="page-count">共 {rows.length} 张</span>
        <div className="page-actions">
          <button className="primary-btn" onClick={openCreate}>
            + 新增优惠券
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>类型</th>
              <th>优惠</th>
              <th>门槛</th>
              <th>有效期至</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.type === 'amount' ? '满减' : '折扣'}</td>
                  <td>{valueText(c)}</td>
                  <td>{c.minSpend > 0 ? `满 ${c.minSpend}` : '无门槛'}</td>
                  <td>{c.expireAt ? c.expireAt.slice(0, 10) : '长期'}</td>
                  <td>
                    <span
                      className={
                        'badge ' + (c.status === 1 ? 'badge-ok' : 'badge-off')
                      }
                    >
                      {c.status === 1 ? '有效' : '停发'}
                    </span>
                  </td>
                  <td>
                    <button className="row-btn" onClick={() => openEdit(c)}>
                      编辑
                    </button>
                    <button
                      className="row-btn danger"
                      onClick={() => remove(c)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div className="modal-mask" onClick={() => setModal({ open: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {modal.id ? '编辑优惠券' : '新增优惠券'}
            </h3>
            <label className="m-label">券名称</label>
            <input
              className="m-input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            <div className="m-row">
              <div className="m-col">
                <label className="m-label">类型</label>
                <select
                  className="m-input"
                  value={form.type}
                  onChange={(e) => setField('type', e.target.value)}
                >
                  <option value="amount">满减</option>
                  <option value="discount">折扣</option>
                </select>
              </div>
              <div className="m-col">
                <label className="m-label">
                  {form.type === 'amount' ? '减免金额(元)' : '折扣(如88=8.8折)'}
                </label>
                <input
                  className="m-input"
                  type="number"
                  value={form.value}
                  onChange={(e) => setField('value', Number(e.target.value))}
                />
              </div>
            </div>
            <div className="m-row">
              <div className="m-col">
                <label className="m-label">使用门槛(元,0=无门槛)</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.minSpend}
                  onChange={(e) => setField('minSpend', Number(e.target.value))}
                />
              </div>
              <div className="m-col">
                <label className="m-label">状态</label>
                <select
                  className="m-input"
                  value={form.status}
                  onChange={(e) => setField('status', Number(e.target.value))}
                >
                  <option value={1}>有效</option>
                  <option value={0}>停发</option>
                </select>
              </div>
            </div>
            <label className="m-label">有效期至(留空=长期)</label>
            <input
              className="m-input"
              type="date"
              value={form.expireAt}
              onChange={(e) => setField('expireAt', e.target.value)}
            />
            <div className="modal-actions">
              <button
                className="ghost-btn"
                onClick={() => setModal({ open: false })}
              >
                取消
              </button>
              <button className="primary-btn" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  Category,
  CategoryInput,
} from '../api/cms'
import { ApiError } from '../api/client'

const EMPTY: CategoryInput = { name: '', icon: '', sort: 0, status: 1 }

export default function Categories() {
  const [rows, setRows] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; id?: number }>({
    open: false,
  })
  const [form, setForm] = useState<CategoryInput>(EMPTY)

  const load = useCallback(async () => {
    setError('')
    try {
      setRows(await getCategories())
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
  const openEdit = (c: Category) => {
    setForm({ name: c.name, icon: c.icon || '', sort: c.sort, status: c.status })
    setModal({ open: true, id: c.id })
  }
  const setField = (k: keyof CategoryInput, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return alert('请填写分类名')
    try {
      if (modal.id) await updateCategory(modal.id, form)
      else await createCategory(form)
      setModal({ open: false })
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }
  const remove = async (c: Category) => {
    if (!confirm(`删除分类「${c.name}」?`)) return
    try {
      await deleteCategory(c.id)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">分类管理</h2>
        <span className="page-count">共 {rows.length} 个分类</span>
        <div className="page-actions">
          <button className="primary-btn" onClick={openCreate}>
            + 新增分类
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
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-empty">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.sort}</td>
                  <td>
                    <span
                      className={
                        'badge ' + (c.status === 1 ? 'badge-ok' : 'badge-off')
                      }
                    >
                      {c.status === 1 ? '显示' : '隐藏'}
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
              {modal.id ? '编辑分类' : '新增分类'}
            </h3>
            <label className="m-label">分类名称</label>
            <input
              className="m-input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            <label className="m-label">图标 URL</label>
            <input
              className="m-input"
              value={form.icon}
              onChange={(e) => setField('icon', e.target.value)}
            />
            <div className="m-row">
              <div className="m-col">
                <label className="m-label">排序</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.sort}
                  onChange={(e) => setField('sort', Number(e.target.value))}
                />
              </div>
              <div className="m-col">
                <label className="m-label">状态</label>
                <select
                  className="m-input"
                  value={form.status}
                  onChange={(e) => setField('status', Number(e.target.value))}
                >
                  <option value={1}>显示</option>
                  <option value={0}>隐藏</option>
                </select>
              </div>
            </div>
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

import { useEffect, useState, useCallback } from 'react'
import {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  Banner,
  BannerInput,
} from '../api/cms'
import { ApiError } from '../api/client'

const EMPTY: BannerInput = {
  image: '',
  title: '',
  link: '',
  sort: 0,
  status: 1,
}

export default function Banners() {
  const [rows, setRows] = useState<Banner[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; id?: number }>({
    open: false,
  })
  const [form, setForm] = useState<BannerInput>(EMPTY)

  const load = useCallback(async () => {
    setError('')
    try {
      setRows(await getBanners())
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
  const openEdit = (b: Banner) => {
    setForm({
      image: b.image,
      title: b.title || '',
      link: b.link || '',
      sort: b.sort,
      status: b.status,
    })
    setModal({ open: true, id: b.id })
  }
  const setField = (k: keyof BannerInput, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.image.trim()) return alert('请填写图片 URL')
    try {
      if (modal.id) await updateBanner(modal.id, form)
      else await createBanner(form)
      setModal({ open: false })
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }
  const remove = async (b: Banner) => {
    if (!confirm('删除该轮播?')) return
    try {
      await deleteBanner(b.id)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">轮播管理</h2>
        <span className="page-count">共 {rows.length} 张</span>
        <div className="page-actions">
          <button className="primary-btn" onClick={openCreate}>
            + 新增轮播
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>预览</th>
              <th>标题</th>
              <th>跳转</th>
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>
                    {b.image ? (
                      <img className="thumb" src={b.image} alt="" />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{b.title || '-'}</td>
                  <td className="cell-name">{b.link || '-'}</td>
                  <td>{b.sort}</td>
                  <td>
                    <span
                      className={
                        'badge ' + (b.status === 1 ? 'badge-ok' : 'badge-off')
                      }
                    >
                      {b.status === 1 ? '显示' : '隐藏'}
                    </span>
                  </td>
                  <td>
                    <button className="row-btn" onClick={() => openEdit(b)}>
                      编辑
                    </button>
                    <button
                      className="row-btn danger"
                      onClick={() => remove(b)}
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
              {modal.id ? '编辑轮播' : '新增轮播'}
            </h3>
            <label className="m-label">图片 URL</label>
            <input
              className="m-input"
              value={form.image}
              onChange={(e) => setField('image', e.target.value)}
            />
            <label className="m-label">标题</label>
            <input
              className="m-input"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
            />
            <label className="m-label">跳转链接</label>
            <input
              className="m-input"
              value={form.link}
              onChange={(e) => setField('link', e.target.value)}
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

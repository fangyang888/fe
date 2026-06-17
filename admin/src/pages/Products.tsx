import { useEffect, useState, useCallback } from 'react'
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  Product,
  ProductInput,
} from '../api/product'
import { ApiError } from '../api/client'

const EMPTY: ProductInput = {
  name: '',
  price: 0,
  originalPrice: undefined,
  image: '',
  stock: 0,
  categoryId: undefined,
  description: '',
  isRecommend: 0,
  status: 1,
}

export default function Products() {
  const [rows, setRows] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; id?: number }>({
    open: false,
  })
  const [form, setForm] = useState<ProductInput>(EMPTY)
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getProducts(page, pageSize, keyword)
      setRows(res.list)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY)
    setModal({ open: true })
  }

  const openEdit = (p: Product) => {
    setForm({
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice,
      image: p.image || '',
      stock: p.stock,
      categoryId: p.categoryId,
      description: p.description || '',
      isRecommend: p.isRecommend,
      status: p.status,
    })
    setModal({ open: true, id: p.id })
  }

  const setField = (k: keyof ProductInput, v: string | number) => {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  const save = async () => {
    if (!form.name.trim()) {
      alert('请填写商品名称')
      return
    }
    try {
      if (modal.id) {
        await updateProduct(modal.id, form)
      } else {
        await createProduct(form)
      }
      setModal({ open: false })
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }

  const remove = async (p: Product) => {
    if (!confirm(`确定删除「${p.name}」?`)) return
    try {
      await deleteProduct(p.id)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">商品管理</h2>
        <span className="page-count">共 {total} 个商品</span>
        <div className="page-actions">
          <input
            className="search-input"
            placeholder="搜索商品名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setPage(1)
            }}
          />
          <button className="primary-btn" onClick={openCreate}>
            + 新增商品
          </button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>商品名</th>
              <th>价格</th>
              <th>库存</th>
              <th>销量</th>
              <th>推荐</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td className="cell-name">{p.name}</td>
                  <td>¥{p.price}</td>
                  <td>{p.stock}</td>
                  <td>{p.sales}</td>
                  <td>{p.isRecommend === 1 ? '是' : '-'}</td>
                  <td>
                    <span
                      className={
                        'badge ' + (p.status === 1 ? 'badge-ok' : 'badge-off')
                      }
                    >
                      {p.status === 1 ? '上架' : '下架'}
                    </span>
                  </td>
                  <td>
                    <button className="row-btn" onClick={() => openEdit(p)}>
                      编辑
                    </button>
                    <button
                      className="row-btn danger"
                      onClick={() => remove(p)}
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

      {modal.open && (
        <div className="modal-mask" onClick={() => setModal({ open: false })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {modal.id ? '编辑商品' : '新增商品'}
            </h3>

            <label className="m-label">商品名称</label>
            <input
              className="m-input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />

            <div className="m-row">
              <div className="m-col">
                <label className="m-label">价格(元)</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.price}
                  onChange={(e) => setField('price', Number(e.target.value))}
                />
              </div>
              <div className="m-col">
                <label className="m-label">原价(元)</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.originalPrice ?? ''}
                  onChange={(e) =>
                    setField('originalPrice', Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="m-row">
              <div className="m-col">
                <label className="m-label">库存</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setField('stock', Number(e.target.value))}
                />
              </div>
              <div className="m-col">
                <label className="m-label">分类ID</label>
                <input
                  className="m-input"
                  type="number"
                  value={form.categoryId ?? ''}
                  onChange={(e) =>
                    setField('categoryId', Number(e.target.value))
                  }
                />
              </div>
            </div>

            <label className="m-label">图片 URL</label>
            <input
              className="m-input"
              value={form.image}
              onChange={(e) => setField('image', e.target.value)}
            />

            <label className="m-label">描述</label>
            <textarea
              className="m-input m-textarea"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />

            <div className="m-row">
              <div className="m-col">
                <label className="m-label">推荐</label>
                <select
                  className="m-input"
                  value={form.isRecommend}
                  onChange={(e) =>
                    setField('isRecommend', Number(e.target.value))
                  }
                >
                  <option value={0}>否</option>
                  <option value={1}>是</option>
                </select>
              </div>
              <div className="m-col">
                <label className="m-label">状态</label>
                <select
                  className="m-input"
                  value={form.status}
                  onChange={(e) => setField('status', Number(e.target.value))}
                >
                  <option value={1}>上架</option>
                  <option value={0}>下架</option>
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

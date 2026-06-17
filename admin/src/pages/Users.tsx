import { useEffect, useState, useCallback } from 'react'
import {
  getUsers,
  setUserStatus,
  createUser,
  isSuperAdmin,
  CreateAccountInput,
} from '../api/auth'
import { ApiError } from '../api/client'
import type { UserRow } from '../api/types'

const EMPTY_FORM: CreateAccountInput = {
  username: '',
  password: '',
  nickname: '',
  isAdmin: false,
}

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsers(page, pageSize)
      setRows(res.list)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  const toggleStatus = async (u: UserRow) => {
    try {
      await setUserStatus(u.id, u.status === 1 ? 0 : 1)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  // 添加用户（仅超管可见）
  const canCreate = isSuperAdmin()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<CreateAccountInput>(EMPTY_FORM)
  const setField = (k: keyof CreateAccountInput, v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }))

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  const saveUser = async () => {
    if (!form.username.trim()) return alert('请填写账号')
    if (!form.password || form.password.length < 6)
      return alert('密码至少 6 位')
    try {
      await createUser(form)
      setModalOpen(false)
      setPage(1)
      load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '创建失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">用户管理</h2>
        <span className="page-count">共 {total} 个用户</span>
        {canCreate && (
          <div className="page-actions">
            <button className="primary-btn" onClick={openCreate}>
              + 添加用户
            </button>
          </div>
        )}
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>账号/昵称</th>
              <th>手机号</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
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
              rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username || u.nickname || '-'}</td>
                  <td>{u.phone || '-'}</td>
                  <td>
                    {u.roles && u.roles.length > 0
                      ? u.roles.map((r) => r.name).join(', ')
                      : '-'}
                  </td>
                  <td>
                    <span
                      className={
                        'badge ' + (u.status === 1 ? 'badge-ok' : 'badge-off')
                      }
                    >
                      {u.status === 1 ? '正常' : '禁用'}
                    </span>
                  </td>
                  <td>{u.created_at?.slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <button
                      className="row-btn"
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === 1 ? '禁用' : '启用'}
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

      {modalOpen && (
        <div className="modal-mask" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">添加用户</h3>

            <label className="m-label">账号</label>
            <input
              className="m-input"
              value={form.username}
              onChange={(e) => setField('username', e.target.value)}
              placeholder="登录账号"
            />

            <label className="m-label">密码</label>
            <input
              className="m-input"
              type="password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="至少 6 位"
            />

            <label className="m-label">昵称(可选)</label>
            <input
              className="m-input"
              value={form.nickname}
              onChange={(e) => setField('nickname', e.target.value)}
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setField('isAdmin', e.target.checked)}
              />
              <span>设为超级管理员</span>
            </label>

            <div className="modal-actions">
              <button
                className="ghost-btn"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button className="primary-btn" onClick={saveUser}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

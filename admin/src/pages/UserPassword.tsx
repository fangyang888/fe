import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { changeUserPassword, getCurrentUser, getUser, isSuperAdmin, logout } from '../api/auth'
import { ApiError } from '../api/client'
import type { UserRow } from '../api/types'

export default function UserPassword() {
  const { id } = useParams()
  const userId = Number(id)
  const navigate = useNavigate()
  const canChange = isSuperAdmin()
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const submitting = useRef(false)

  useEffect(() => {
    let active = true
    setUser(null)
    setPassword('')
    setConfirmation('')
    setError('')
    setSuccess(false)
    setVisible(false)
    setLoadError('')
    setLoading(true)
    if (!canChange || !Number.isSafeInteger(userId) || userId <= 0) {
      setLoadError(canChange ? '用户地址无效' : '仅超级管理员可以修改用户密码')
      setLoading(false)
      return
    }
    getUser(userId)
      .then((data) => { if (active) setUser(data) })
      .catch((err) => {
        if (active) setLoadError(err instanceof ApiError ? err.message : '加载用户失败，请重试')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, canChange, attempt])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || !user?.username || !canChange) return
    setError('')
    if (password.length < 6 || password.length > 64 || !password.trim()) {
      setError('密码须为 6–64 位，不能全部为空格')
      return
    }
    if (password !== confirmation) {
      setError('两次输入的密码不一致')
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      await changeUserPassword(user.id, password)
      setPassword('')
      setConfirmation('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '修改失败，请重试')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  const loginAgain = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page password-page">
      <div className="page-head">
        <h2 className="page-title">修改密码</h2>
        <Link className="password-back" to="/users">返回用户列表</Link>
      </div>
      <section className="password-card" aria-busy={loading || saving}>
        {loading ? <p role="status">正在加载用户信息...</p> : loadError ? (
          <>
            <div className="page-error" role="alert">{loadError}</div>
            {canChange && Number.isSafeInteger(userId) && userId > 0 && (
              <button className="ghost-btn" onClick={() => setAttempt((value) => value + 1)}>重新加载</button>
            )}
          </>
        ) : user && (
          <>
            <div className="password-account">
              <span className="password-eyebrow">正在修改的账号</span>
              <h3>{user.username || user.nickname || '微信用户'}</h3>
              <span className="password-hint">用户 ID：{user.id}{user.nickname ? ` · ${user.nickname}` : ''}</span>
            </div>
            {!user.username ? (
              <p className="password-hint">此用户使用微信登录，没有账号密码，无需修改。</p>
            ) : success ? (
              <div>
                <div className="password-success" role="status">密码修改成功，下次登录请使用新密码。</div>
                <div className="password-actions">
                  <Link className="ghost-btn" to="/users">返回用户列表</Link>
                  {getCurrentUser()?.id === user.id && (
                    <button className="primary-btn" onClick={loginAgain}>重新登录</button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <p className="password-hint password-intro">由超级管理员设置新密码，无需填写原密码。</p>
                <label className="m-label" htmlFor="new-password">新密码</label>
                <input id="new-password" className="m-input" type={visible ? 'text' : 'password'}
                  autoComplete="new-password" value={password} disabled={saving} maxLength={64}
                  aria-describedby="password-rules" required
                  onChange={(event) => { setPassword(event.target.value); setError('') }}
                  placeholder="请输入新密码" />
                <p id="password-rules" className="password-hint">6–64 位，建议组合使用字母、数字和符号。</p>
                <label className="m-label" htmlFor="confirm-password">确认新密码</label>
                <input id="confirm-password" className="m-input" type={visible ? 'text' : 'password'}
                  autoComplete="new-password" value={confirmation} disabled={saving} maxLength={64} required
                  onChange={(event) => { setConfirmation(event.target.value); setError('') }}
                  placeholder="请再次输入新密码" />
                <label className="checkbox-row">
                  <input type="checkbox" checked={visible} disabled={saving}
                    onChange={(event) => setVisible(event.target.checked)} />
                  <span>显示密码</span>
                </label>
                {error && <div className="page-error" role="alert">{error}</div>}
                <div className="password-actions">
                  <button type="button" className="ghost-btn" disabled={saving} onClick={() => navigate('/users')}>取消</button>
                  <button type="submit" className="primary-btn" disabled={saving}>{saving ? '保存中...' : '保存新密码'}</button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  )
}

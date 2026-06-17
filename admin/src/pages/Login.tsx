import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../api/auth'
import { ApiError } from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">商城管理后台</h1>
        <p className="login-sub">请登录管理员账号</p>

        <label className="field-label">账号</label>
        <input
          className="field-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入账号"
          autoFocus
        />

        <label className="field-label">密码</label>
        <input
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
        />

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  )
}

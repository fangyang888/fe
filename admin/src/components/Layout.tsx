import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../api/auth'

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const user = getCurrentUser()

  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">商城后台</div>
        <nav className="nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            数据看板
          </NavLink>
          <NavLink
            to="/users"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            用户管理
          </NavLink>
          <NavLink
            to="/products"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            商品管理
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            订单管理
          </NavLink>
          <NavLink
            to="/categories"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            分类管理
          </NavLink>
          <NavLink
            to="/banners"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            轮播管理
          </NavLink>
          <NavLink
            to="/coupons"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            优惠券管理
          </NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">管理后台</div>
          <div className="topbar-right">
            <span className="topbar-user">
              {user?.username || user?.nickname || '管理员'}
            </span>
            <button className="logout-link" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}

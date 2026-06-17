import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Categories from './pages/Categories'
import Banners from './pages/Banners'
import Coupons from './pages/Coupons'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/products" element={<Protected><Products /></Protected>} />
      <Route path="/orders" element={<Protected><Orders /></Protected>} />
      <Route path="/categories" element={<Protected><Categories /></Protected>} />
      <Route path="/banners" element={<Protected><Banners /></Protected>} />
      <Route path="/coupons" element={<Protected><Coupons /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

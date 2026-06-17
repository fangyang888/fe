import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getToken } from '../api/client'

/** 未登录跳转到登录页 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

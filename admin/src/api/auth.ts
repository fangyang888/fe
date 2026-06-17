import { http, setToken, clearToken } from './client'
import type { LoginResult, UserInfo, UserPage } from './types'

const USER_KEY = 'admin_user'

export async function adminLogin(username: string, password: string) {
  const res = await http.post<LoginResult>(
    '/api/auth/admin-login',
    { username, password },
    false,
  )
  setToken(res.token)
  localStorage.setItem(USER_KEY, JSON.stringify(res.userInfo))
  return res.userInfo
}

export function getCurrentUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? (JSON.parse(raw) as UserInfo) : null
}

export function logout() {
  clearToken()
  localStorage.removeItem(USER_KEY)
}

// 用户管理
export const getUsers = (page = 1, pageSize = 20) =>
  http.get<UserPage>(`/api/user?page=${page}&pageSize=${pageSize}`)

export const setUserStatus = (id: number, status: number) =>
  http.put(`/api/user/${id}/status`, { status })

export interface CreateAccountInput {
  username: string
  password: string
  nickname?: string
  isAdmin?: boolean
}
export const createUser = (data: CreateAccountInput) =>
  http.post('/api/user', data)

/** 当前用户是否超级管理员 */
export const isSuperAdmin = (): boolean => {
  const u = getCurrentUser()
  return !!u?.roles?.some((r) => r.code === 'admin')
}

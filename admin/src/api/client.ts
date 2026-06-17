// 统一请求封装：带 token、处理 401、解析后端错误
const TOKEN_KEY = 'admin_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  auth?: boolean
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  // 仅对“已登录请求”的 401 视为登录过期并跳登录页；
  // 登录接口本身（auth=false）的 401 是账号/密码错误，应透传真实信息。
  if (res.status === 401 && auth) {
    clearToken()
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    const loginPath = `${base}/login`
    if (location.pathname !== loginPath) location.href = loginPath
    throw new ApiError('登录已过期', 401)
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : '') || `请求失败 (${res.status})`
    throw new ApiError(msg, res.status)
  }

  return data as T
}

export const http = {
  get: <T>(url: string, auth = true) => request<T>(url, { method: 'GET', auth }),
  post: <T>(url: string, body?: unknown, auth = true) =>
    request<T>(url, { method: 'POST', body, auth }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}

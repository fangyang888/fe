import Taro from '@tarojs/taro'
import { BASE_URL, STORAGE_KEYS } from '../config'

/** 后端统一返回包装（按需调整） */
export interface ApiResult<T = any> {
  data: T
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, any>
  /** 是否需要登录态（默认 true）。登录接口本身传 false */
  auth?: boolean
  /** 静默：失败不弹 toast */
  silent?: boolean
}

let isRedirecting = false

/**
 * 统一请求封装：自动加 baseUrl、带 token、处理 401 与错误提示。
 * 直接 resolve 后端返回的业务数据。
 */
export function request<T = any>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, auth = true, silent = false } = options

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = Taro.getStorageSync(STORAGE_KEYS.TOKEN)
    if (token) header.Authorization = `Bearer ${token}`
  }

  return new Promise<T>((resolve, reject) => {
    Taro.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header,
      success: (res) => {
        const { statusCode, data: body } = res
        if (statusCode >= 200 && statusCode < 300) {
          resolve(body as T)
          return
        }
        // 登录态失效
        if (statusCode === 401) {
          handleUnauthorized()
          reject(res)
          return
        }
        const msg = (body as any)?.message || `请求失败(${statusCode})`
        if (!silent) Taro.showToast({ title: String(msg), icon: 'none' })
        reject(res)
      },
      fail: (err) => {
        if (!silent) Taro.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 清理登录态并提示重新登录 */
function handleUnauthorized() {
  Taro.removeStorageSync(STORAGE_KEYS.TOKEN)
  Taro.removeStorageSync(STORAGE_KEYS.USER_INFO)
  if (isRedirecting) return
  isRedirecting = true
  Taro.showToast({ title: '登录已过期', icon: 'none' })
  setTimeout(() => {
    isRedirecting = false
  }, 1500)
}

export const http = {
  get: <T = any>(url: string, opts?: Partial<RequestOptions>) =>
    request<T>({ url, method: 'GET', ...opts }),
  post: <T = any>(url: string, data?: any, opts?: Partial<RequestOptions>) =>
    request<T>({ url, method: 'POST', data, ...opts }),
  put: <T = any>(url: string, data?: any, opts?: Partial<RequestOptions>) =>
    request<T>({ url, method: 'PUT', data, ...opts }),
  delete: <T = any>(url: string, opts?: Partial<RequestOptions>) =>
    request<T>({ url, method: 'DELETE', ...opts }),
}

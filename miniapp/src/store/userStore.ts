import Taro from '@tarojs/taro'
import { STORAGE_KEYS } from '../config'
import { apiLogin, apiGetProfile, UserInfo } from '../api/user'

/** 读取本地缓存的用户信息 */
export const getUserInfo = (): UserInfo | null => {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.USER_INFO)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

const saveUserInfo = (user: UserInfo) => {
  Taro.setStorageSync(STORAGE_KEYS.USER_INFO, JSON.stringify(user))
}

let sessionVersion = 0
let pendingLogin: Promise<UserInfo | null> | null = null

export const getToken = (): string =>
  Taro.getStorageSync(STORAGE_KEYS.TOKEN) || ''

/** 接口保存成功后同步本地资料，只接受发起请求时的同一登录会话。 */
export const cacheUserInfo = (user: UserInfo, token: string): boolean => {
  if (!token || getToken() !== token) return false
  saveUserInfo(user)
  return true
}

export const isLoggedIn = (): boolean => !!getToken()

/**
 * 静默登录：wx.login 拿 code → 换 token → 存储。
 * App 启动时调用，保证后续请求有 token。
 */
export const login = (): Promise<UserInfo | null> => {
  if (pendingLogin) return pendingLogin
  const version = sessionVersion
  const task = (async () => {
    try {
      const { code } = await Taro.login()
      if (!code || version !== sessionVersion) return null
      const { token, userInfo } = await apiLogin(code)
      if (version !== sessionVersion) return null
      Taro.setStorageSync(STORAGE_KEYS.TOKEN, token)
      Taro.removeStorageSync(STORAGE_KEYS.LOGGED_OUT)
      saveUserInfo(userInfo)
      return userInfo
    } catch {
      return null
    }
  })()
  pendingLogin = task
  task.finally(() => { if (pendingLogin === task) pendingLogin = null })
  return task
}

/** 用户主动退出后，即使重启也不静默登录；仅点击登录才恢复。 */
export const ensureLogin = (): Promise<UserInfo | null> => {
  if (isLoggedIn()) return Promise.resolve(getUserInfo())
  if (Taro.getStorageSync(STORAGE_KEYS.LOGGED_OUT)) return Promise.resolve(null)
  return login()
}

/** 拉取最新用户信息并更新缓存 */
export const refreshUserInfo = async (): Promise<UserInfo | null> => {
  const token = getToken()
  const version = sessionVersion
  if (!token) return null
  try {
    const user = await apiGetProfile()
    if (version !== sessionVersion || getToken() !== token) return null
    saveUserInfo(user)
    return user
  } catch {
    return null
  }
}

/** 是否拥有某角色 */
export const hasRole = (code: string): boolean => {
  const user = getUserInfo()
  return !!user?.roles?.some((r) => r.code === code)
}

/** 是否管理员 */
export const isAdmin = (): boolean => hasRole('admin')

/** 退出登录 */
export const logout = () => {
  sessionVersion++
  pendingLogin = null
  Taro.setStorageSync(STORAGE_KEYS.LOGGED_OUT, true)
  Taro.removeStorageSync(STORAGE_KEYS.TOKEN)
  Taro.removeStorageSync(STORAGE_KEYS.USER_INFO)
}

/** 清理缓存但保留当前登录状态和用户主动退出的选择。 */
export const clearLocalCache = () => {
  const entries = Object.values(STORAGE_KEYS).map((key) => [key, Taro.getStorageSync(key)] as const)
  Taro.clearStorageSync()
  entries.forEach(([key, value]) => { if (value !== undefined && value !== '') Taro.setStorageSync(key, value) })
}

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

export const getToken = (): string =>
  Taro.getStorageSync(STORAGE_KEYS.TOKEN) || ''

export const isLoggedIn = (): boolean => !!getToken()

/**
 * 静默登录：wx.login 拿 code → 换 token → 存储。
 * App 启动时调用，保证后续请求有 token。
 */
export const login = async (): Promise<UserInfo | null> => {
  try {
    const { code } = await Taro.login()
    if (!code) return null
    const { token, userInfo } = await apiLogin(code)
    Taro.setStorageSync(STORAGE_KEYS.TOKEN, token)
    saveUserInfo(userInfo)
    return userInfo
  } catch (e) {
    console.error('登录失败', e)
    return null
  }
}

/** 拉取最新用户信息并更新缓存 */
export const refreshUserInfo = async (): Promise<UserInfo | null> => {
  try {
    const user = await apiGetProfile()
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
  Taro.removeStorageSync(STORAGE_KEYS.TOKEN)
  Taro.removeStorageSync(STORAGE_KEYS.USER_INFO)
}

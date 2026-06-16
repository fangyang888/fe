import { http } from '../utils/request'

export interface UserRole {
  code: string
  name: string
}

export interface UserInfo {
  id: number
  openid: string
  nickname?: string
  avatar?: string
  gender?: number
  phone?: string
  roles?: UserRole[]
}

export interface LoginResult {
  token: string
  userInfo: UserInfo
}

/** 小程序登录：用 wx.login 的 code 换 token */
export const apiLogin = (code: string) =>
  http.post<LoginResult>('/api/auth/login', { code }, { auth: false })

/** 获取当前登录用户信息 */
export const apiGetProfile = () => http.get<UserInfo>('/api/user/profile')

/** 更新昵称/头像/性别 */
export const apiUpdateProfile = (data: {
  nickname?: string
  avatar?: string
  gender?: number
}) => http.put<UserInfo>('/api/user/profile', data)

/** 绑定手机号 */
export const apiBindPhone = (code: string) =>
  http.post<{ phone: string }>('/api/auth/phone', { code })

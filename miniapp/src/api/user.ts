import { http } from '../utils/request'
import Taro from '@tarojs/taro'
import { BASE_URL, STORAGE_KEYS } from '../config'

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

/** chooseAvatar 返回本地临时文件，必须上传后才能保存头像。 */
export const apiUploadAvatar = async (filePath: string): Promise<string> => {
  const token = Taro.getStorageSync(STORAGE_KEYS.TOKEN)
  if (!token) throw new Error('请先登录')
  const response = await Taro.uploadFile({
    url: `${BASE_URL}/api/user/avatar`, filePath, name: 'file',
    header: { Authorization: `Bearer ${token}` },
  })
  if (Taro.getStorageSync(STORAGE_KEYS.TOKEN) !== token) throw new Error('登录状态已改变')
  let data: { url?: string; message?: string }
  try { data = JSON.parse(response.data) } catch { throw new Error('头像上传失败，请重试') }
  if (response.statusCode < 200 || response.statusCode >= 300 || !data.url) {
    throw new Error(data.message || '头像上传失败，请重试')
  }
  return data.url
}

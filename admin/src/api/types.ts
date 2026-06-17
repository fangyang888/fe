export interface Role {
  code: string
  name: string
}

export interface UserInfo {
  id: number
  openid: string
  username?: string
  nickname?: string
  avatar?: string
  phone?: string
  roles?: Role[]
}

export interface LoginResult {
  token: string
  userInfo: UserInfo
}

export interface UserRow {
  id: number
  openid: string
  username?: string
  nickname?: string
  avatar?: string
  phone?: string
  status: number
  created_at: string
  roles?: Role[]
}

export interface UserPage {
  list: UserRow[]
  total: number
  page: number
  pageSize: number
}

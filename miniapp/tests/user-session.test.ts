import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  storage: new Map<string, unknown>(), login: vi.fn(), apiLogin: vi.fn(), apiGetProfile: vi.fn(),
}))
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => fixtures.storage.get(key) || '',
  setStorageSync: (key: string, value: unknown) => fixtures.storage.set(key, value),
  removeStorageSync: (key: string) => fixtures.storage.delete(key),
  clearStorageSync: () => fixtures.storage.clear(),
  login: fixtures.login,
} }))
vi.mock('../src/api/user', () => ({ apiLogin: fixtures.apiLogin, apiGetProfile: fixtures.apiGetProfile }))

const user = { id: 3, openid: 'test', nickname: '测试用户' }
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  fixtures.storage.clear()
  fixtures.login.mockResolvedValue({ code: 'test-code' })
  fixtures.apiLogin.mockResolvedValue({ token: 'test-token', userInfo: user })
  fixtures.apiGetProfile.mockResolvedValue(user)
})

describe('Miniapp session lifecycle', () => {
  it('deduplicates startup login and keeps explicit logout across restarts', async () => {
    let store = await import('../src/store/userStore')
    await Promise.all([store.ensureLogin(), store.ensureLogin()])
    expect(fixtures.login).toHaveBeenCalledTimes(1)
    store.logout()
    expect(store.getUserInfo()).toBeNull()
    expect(store.isLoggedIn()).toBe(false)
    vi.resetModules()
    store = await import('../src/store/userStore')
    expect(await store.ensureLogin()).toBeNull()
    expect(fixtures.login).toHaveBeenCalledTimes(1)
    expect(await store.login()).toEqual(user)
    expect(store.isLoggedIn()).toBe(true)
  })

  it('does not restore a session when a pending login finishes after logout', async () => {
    let complete!: (value: unknown) => void
    fixtures.apiLogin.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const store = await import('../src/store/userStore')
    const pending = store.login()
    await vi.waitFor(() => expect(complete).toBeDefined())
    store.logout()
    complete({ token: 'stale-token', userInfo: user })
    expect(await pending).toBeNull()
    expect(store.isLoggedIn()).toBe(false)
    expect(await store.ensureLogin()).toBeNull()
  })

  it('does not cache a stale profile after logout and preserves logout when clearing cache', async () => {
    let complete!: (value: unknown) => void
    const store = await import('../src/store/userStore')
    await store.login()
    fixtures.apiGetProfile.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = store.refreshUserInfo()
    store.logout()
    fixtures.storage.set('unrelated-cache', 'cached')
    store.clearLocalCache()
    complete(user)
    expect(await pending).toBeNull()
    expect(store.getUserInfo()).toBeNull()
    expect(fixtures.storage.has('unrelated-cache')).toBe(false)
    expect(await store.ensureLogin()).toBeNull()
  })

  it('clears cache without logging out an active user', async () => {
    const store = await import('../src/store/userStore')
    await store.login()
    store.clearLocalCache()
    expect(store.isLoggedIn()).toBe(true)
    expect(store.getUserInfo()).toEqual(user)
  })

  it('updates cached profile only for the active session', async () => {
    const store = await import('../src/store/userStore')
    await store.login()
    expect(store.cacheUserInfo({ ...user, nickname: '新昵称' }, 'test-token')).toBe(true)
    expect(store.getUserInfo()?.nickname).toBe('新昵称')
    store.logout()
    expect(store.cacheUserInfo(user, 'test-token')).toBe(false)
    expect(store.getUserInfo()).toBeNull()
  })
})

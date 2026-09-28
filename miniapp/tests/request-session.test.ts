import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixtures = vi.hoisted(() => ({ storage: new Map<string, unknown>(), request: vi.fn(), toast: vi.fn() }))
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => fixtures.storage.get(key) || '',
  setStorageSync: (key: string, value: unknown) => fixtures.storage.set(key, value),
  removeStorageSync: (key: string) => fixtures.storage.delete(key),
  request: fixtures.request,
  showToast: fixtures.toast,
} }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  fixtures.storage.clear()
})

describe('Request authentication boundaries', () => {
  it('allows public catalog access while logged out and blocks private requests locally', async () => {
    const { http } = await import('../src/utils/request')
    await expect(http.get('/api/user/profile')).rejects.toThrow('未登录')
    expect(fixtures.request).not.toHaveBeenCalled()
    const pending = http.get('/api/home', { auth: false })
    fixtures.request.mock.calls[0][0].success({ statusCode: 200, data: { products: [] } })
    await expect(pending).resolves.toEqual({ products: [] })
  })

  it('ignores an old 401 after another account/session has logged in', async () => {
    const { http } = await import('../src/utils/request')
    fixtures.storage.set('auth_token', 'old-token')
    const pending = http.get('/api/user/profile')
    fixtures.storage.set('auth_token', 'new-token')
    fixtures.request.mock.calls[0][0].success({ statusCode: 401, data: {} })
    await expect(pending).rejects.toThrow('登录状态已改变')
    expect(fixtures.storage.get('auth_token')).toBe('new-token')
  })

  it('does not deliver private data after logout', async () => {
    const { http } = await import('../src/utils/request')
    fixtures.storage.set('auth_token', 'old-token')
    const pending = http.get('/api/user/profile')
    fixtures.storage.delete('auth_token')
    fixtures.request.mock.calls[0][0].success({ statusCode: 200, data: { nickname: '旧账号' } })
    await expect(pending).rejects.toThrow('登录状态已改变')
  })

  it('requires an explicit login after the current session expires', async () => {
    const { http } = await import('../src/utils/request')
    fixtures.storage.set('auth_token', 'old-token')
    fixtures.storage.set('user_info', 'old-user')
    const pending = http.get('/api/user/profile')
    fixtures.request.mock.calls[0][0].success({ statusCode: 401, data: {} })
    await expect(pending).rejects.toMatchObject({ statusCode: 401 })
    expect(fixtures.storage.has('auth_token')).toBe(false)
    expect(fixtures.storage.has('user_info')).toBe(false)
    expect(fixtures.storage.get('auth_logged_out')).toBe(true)
  })
})

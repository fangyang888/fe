import Taro from '@tarojs/taro'
import { reportEvents, TrackEvent } from '../api/track'
import { getUserInfo } from '../store/userStore'

// 触发上报的阈值
const FLUSH_SIZE = 10 // 累计条数
const FLUSH_INTERVAL = 5000 // 间隔(ms)

let queue: TrackEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let sessionId = ''
let systemInfo: { os?: string; appVersion?: string } = {}

/** 生成会话 id（一次启动一个） */
function genSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 初始化：App 启动时调一次 */
export function initTracker() {
  sessionId = genSessionId()
  try {
    const info = Taro.getSystemInfoSync()
    const account = Taro.getAccountInfoSync?.()
    systemInfo = {
      os: info.system,
      appVersion: account?.miniProgram?.version || info.version,
    }
  } catch {
    systemInfo = {}
  }
}

/** 当前页面路径 */
function currentPage(): string {
  try {
    const pages = Taro.getCurrentPages()
    const cur = pages[pages.length - 1]
    return cur ? `/${cur.route}` : ''
  } catch {
    return ''
  }
}

/** 立即上报队列 */
export function flush() {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  reportEvents(batch)
}

function scheduleFlush() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    flush()
  }, FLUSH_INTERVAL)
}

/**
 * 埋点：业务侧只需 track('add_to_cart', { productId })。
 * SDK 自动补 openid / sessionId / page / 平台 / 时间等公共参数。
 */
export function track(
  eventName: string,
  params?: Record<string, any>,
  eventType: string = 'custom',
) {
  const user = getUserInfo()
  queue.push({
    eventName,
    eventType,
    openid: user?.openid,
    sessionId,
    page: currentPage(),
    params,
    platform: 'mp-weixin',
    appVersion: systemInfo.appVersion,
    os: systemInfo.os,
    ts: Date.now(),
  })

  if (queue.length >= FLUSH_SIZE) {
    flush()
  } else {
    scheduleFlush()
  }
}

/** 页面曝光 */
export function trackPageView(page?: string) {
  track('page_view', { page: page || currentPage() }, 'pageview')
}

export const tracker = { initTracker, track, trackPageView, flush }
export default tracker

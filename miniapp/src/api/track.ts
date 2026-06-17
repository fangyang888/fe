import Taro from '@tarojs/taro'
import { BASE_URL } from '../config'

export interface TrackEvent {
  eventName: string
  eventType?: string
  openid?: string
  sessionId?: string
  page?: string
  params?: Record<string, any>
  platform?: string
  appVersion?: string
  os?: string
  ts?: number
}

/**
 * 埋点上报：独立于业务 request 封装，绝不弹错、绝不阻塞主流程。
 * 不带鉴权（未登录也采集）。
 */
export function reportEvents(events: TrackEvent[]): Promise<void> {
  return new Promise((resolve) => {
    Taro.request({
      url: `${BASE_URL}/api/track/report`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { events },
      success: () => resolve(),
      fail: () => resolve(), // 静默失败
    })
  })
}

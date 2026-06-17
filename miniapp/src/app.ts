import { PropsWithChildren } from 'react'
import { useLaunch, useDidHide } from '@tarojs/taro'
import { isLoggedIn, login } from './store/userStore'
import { initTracker, track, flush } from './utils/tracker'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    // 启动时静默登录：没 token 才走一遍，保证后续请求带身份
    if (!isLoggedIn()) {
      login()
    }
    // 初始化埋点 + 上报启动事件
    initTracker()
    track('app_launch', { scene: options?.scene }, 'action')
  })

  // 小程序切后台：把剩余埋点立即上报，避免丢失
  useDidHide(() => {
    flush()
  })

  // children 是将要会渲染的页面
  return children
}

export default App

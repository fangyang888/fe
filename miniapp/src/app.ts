import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { isLoggedIn, login } from './store/userStore'
import './app.scss'

function App({ children }: PropsWithChildren) {

  useLaunch(() => {
    // 启动时静默登录：没 token 才走一遍，保证后续请求带身份
    if (!isLoggedIn()) {
      login()
    }
  })

  // children 是将要会渲染的页面
  return children
}

export default App

import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { logout, login } from '../../store/userStore'
import './index.scss'

export default function Settings() {
  const handleLogout = async () => {
    const res = await Taro.showModal({ title: '提示', content: '确定退出登录?' })
    if (!res.confirm) return
    logout()
    // 退出后重新静默登录（dev 环境会回到 dev 用户），并返回上一页
    await login()
    Taro.showToast({ title: '已退出', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 600)
  }

  const clearCache = async () => {
    const res = await Taro.showModal({ title: '提示', content: '清除本地缓存?' })
    if (!res.confirm) return
    try {
      Taro.clearStorageSync()
    } catch {
      // ignore
    }
    Taro.showToast({ title: '已清除', icon: 'success' })
  }

  const showAbout = () => {
    Taro.showModal({
      title: '关于',
      content: '商城小程序 v1.0.0\n基于 Taro + NestJS',
      showCancel: false,
    })
  }

  return (
    <View className='settings-page'>
      <View className='group'>
        <View className='cell' onClick={clearCache}>
          <Text className='cell-text'>清除缓存</Text>
          <Text className='cell-arrow'>›</Text>
        </View>
        <View className='cell' onClick={showAbout}>
          <Text className='cell-text'>关于我们</Text>
          <Text className='cell-arrow'>›</Text>
        </View>
      </View>

      <View className='logout-btn' onClick={handleLogout}>
        <Text className='logout-text'>退出登录</Text>
      </View>
    </View>
  )
}

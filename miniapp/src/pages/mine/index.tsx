import { View, Text, Image, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { UserInfo } from '../../api/user'
import { apiUpdateProfile } from '../../api/user'
import { apiGetOrderSummary, OrderSummary } from '../../api/order'
import {
  getUserInfo,
  isLoggedIn,
  login,
  refreshUserInfo,
} from '../../store/userStore'
import './index.scss'

const EMPTY_SUMMARY: OrderSummary = {
  unpaid: 0,
  unshipped: 0,
  shipping: 0,
  unreviewed: 0,
  afterSale: 0,
}

const DEFAULT_AVATAR =
  'https://img14.360buyimg.com/imagetools/jfs/t1/167902/2/8762/791358/603742d7E9b4275e3/e09d8f9a8bf4c0ef.png'

export default function Mine() {
  const [user, setUser] = useState<UserInfo | null>(getUserInfo())
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [orderSummary, setOrderSummary] = useState<OrderSummary>(EMPTY_SUMMARY)

  // 每次进入页面刷新用户信息 + 订单角标（已登录时）
  useDidShow(() => {
    if (isLoggedIn()) {
      refreshUserInfo().then((u) => u && setUser(u))
      apiGetOrderSummary()
        .then(setOrderSummary)
        .catch(() => setOrderSummary(EMPTY_SUMMARY))
    } else {
      setUser(getUserInfo())
      setOrderSummary(EMPTY_SUMMARY)
    }
  })

  // 未登录：点击触发登录
  const handleLogin = async () => {
    const u = await login()
    if (u) setUser(u)
  }

  // 选择微信头像（open-type=chooseAvatar 回调）
  const handleChooseAvatar = async (e: any) => {
    const avatarUrl = e.detail.avatarUrl
    if (!avatarUrl) return
    const updated = await apiUpdateProfile({ avatar: avatarUrl })
    setUser(updated)
  }

  // 昵称输入失焦时保存
  const handleNicknameBlur = async () => {
    const name = nicknameDraft.trim()
    if (!name || name === user?.nickname) return
    const updated = await apiUpdateProfile({ nickname: name })
    setUser(updated)
  }

  // 跳转到订单列表（可带状态）
  const goOrders = (status?: string) => {
    Taro.navigateTo({
      url: `/pages/order-list/index${status ? `?status=${status}` : ''}`,
    })
  }

  const goPage = (url: string) => {
    Taro.navigateTo({ url })
  }

  // 订单状态格子（角标取自 orderSummary）
  const orderStatusList = [
    { key: 'unpaid', icon: '💳', text: '待付款', count: orderSummary.unpaid },
    { key: 'unshipped', icon: '📦', text: '待发货', count: orderSummary.unshipped },
    { key: 'shipping', icon: '🚚', text: '待收货', count: orderSummary.shipping },
    { key: 'unreviewed', icon: '✍️', text: '待评价', count: orderSummary.unreviewed },
    { key: 'after_sale', icon: '🔄', text: '售后', count: orderSummary.afterSale },
  ]

  const menuList = [
    { id: 1, title: '我的订单', icon: '📦', color: '#ff7a45', url: '/pages/order-list/index' },
    { id: 2, title: '收货地址', icon: '📍', color: '#36cfc9', url: '/pages/address-list/index' },
    { id: 3, title: '优惠券', icon: '🎫', color: '#ffa940', url: '/pages/coupon/index' },
    { id: 4, title: '我的收藏', icon: '❤️', color: '#ff4d6d', url: '/pages/favorite/index' },
    { id: 5, title: '帮助中心', icon: '❓', color: '#597ef7', url: '/pages/help/index' },
    { id: 6, title: '设置', icon: '⚙️', color: '#9254de', url: '/pages/settings/index' },
  ]

  return (
    <View className='mine-page'>
      {/* 用户信息区域 */}
      {user ? (
        <View className='user-section'>
          <View className='user-info'>
            {/* 头像：点击可换成微信头像 */}
            <Button
              className='avatar-btn'
              openType='chooseAvatar'
              onChooseAvatar={handleChooseAvatar}
            >
              <Image
                className='user-avatar'
                src={user.avatar || DEFAULT_AVATAR}
              />
            </Button>
            <View className='user-detail'>
              {user.nickname ? (
                <Text className='user-name'>{user.nickname}</Text>
              ) : (
                <Input
                  className='user-name nickname-input'
                  type='nickname'
                  placeholder='点击设置昵称'
                  onInput={(e) => setNicknameDraft(e.detail.value)}
                  onBlur={handleNicknameBlur}
                />
              )}
              <View className='user-meta'>
                <Text className='user-id'>ID: {user.id}</Text>
                <View className='user-tag'>
                  <Text className='user-tag-text'>
                    {user.roles && user.roles.length > 0
                      ? user.roles[0].name
                      : '普通会员'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Text className='arrow-right'>›</Text>
        </View>
      ) : (
        <View className='user-section'>
          <View className='user-info'>
            <Image className='user-avatar' src={DEFAULT_AVATAR} />
            <View className='user-detail'>
              <Text className='user-name' onClick={handleLogin}>
                点击登录
              </Text>
              <Text className='user-id'>登录后查看更多</Text>
            </View>
          </View>
          <Text className='arrow-right'>›</Text>
        </View>
      )}

      {/* 订单快捷入口 */}
      <View className='order-section'>
        <View className='order-header'>
          <Text className='order-title'>我的订单</Text>
          <View className='order-all' onClick={() => goOrders()}>
            <Text className='all-text'>查看全部</Text>
            <Text className='arrow-small'>›</Text>
          </View>
        </View>
        <View className='order-status-grid'>
          {orderStatusList.map((s) => (
            <View
              className='order-status-item'
              key={s.key}
              onClick={() => goOrders(s.key)}
            >
              <View className='status-icon-wrapper'>
                <Text className='status-icon'>{s.icon}</Text>
                {s.count > 0 && (
                  <View className='status-badge'>
                    <Text className='status-badge-text'>
                      {s.count > 99 ? '99+' : s.count}
                    </Text>
                  </View>
                )}
              </View>
              <Text className='status-text'>{s.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 菜单列表 */}
      <View className='menu-section'>
        {menuList.map((item) => (
          <View
            className='menu-item'
            key={item.id}
            onClick={() => goPage(item.url)}
          >
            <View className='menu-item-left'>
              <View
                className='menu-icon-chip'
                style={{ backgroundColor: item.color }}
              >
                <Text className='menu-icon'>{item.icon}</Text>
              </View>
              <Text className='menu-text'>{item.title}</Text>
            </View>
            <Text className='arrow-small'>›</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

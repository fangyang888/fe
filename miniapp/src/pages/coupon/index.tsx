import { View, Text } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { apiGetMyCoupons, MyCoupon, UserCouponStatus } from '../../api/coupon'
import './index.scss'

const TABS: { key: UserCouponStatus; text: string }[] = [
  { key: 'unused', text: '未使用' },
  { key: 'used', text: '已使用' },
  { key: 'expired', text: '已过期' },
]

export default function CouponPage() {
  const [active, setActive] = useState<UserCouponStatus>('unused')
  const [list, setList] = useState<MyCoupon[]>([])

  const load = async (status: UserCouponStatus) => {
    try {
      setList(await apiGetMyCoupons(status))
    } catch {
      // 统一提示
    }
  }

  useDidShow(() => {
    load(active)
  })

  const switchTab = (key: UserCouponStatus) => {
    setActive(key)
    load(key)
  }

  const formatValue = (c: MyCoupon) =>
    c.type === 'amount' ? `¥${c.value}` : `${(c.value / 10).toFixed(1)}折`

  return (
    <View className='coupon-page'>
      <View className='tabs'>
        {TABS.map((t) => (
          <View
            className={`tab-item ${active === t.key ? 'active' : ''}`}
            key={t.key}
            onClick={() => switchTab(t.key)}
          >
            <Text className='tab-text'>{t.text}</Text>
          </View>
        ))}
      </View>

      {list.length === 0 ? (
        <View className='empty'>
          <Text className='empty-icon'>🎫</Text>
          <Text className='empty-text'>暂无优惠券</Text>
        </View>
      ) : (
        <View className='list'>
          {list.map((c) => (
            <View
              className={`coupon-card ${c.status !== 'unused' ? 'disabled' : ''}`}
              key={c.id}
            >
              <View className='coupon-left'>
                <Text className='coupon-value'>{formatValue(c)}</Text>
                <Text className='coupon-min'>
                  {c.minSpend > 0 ? `满${c.minSpend}可用` : '无门槛'}
                </Text>
              </View>
              <View className='coupon-right'>
                <Text className='coupon-name'>{c.name}</Text>
                <Text className='coupon-expire'>
                  {c.expireAt ? `有效期至 ${c.expireAt.slice(0, 10)}` : '长期有效'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

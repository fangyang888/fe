import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { apiGetOrders, Order, OrderStatus } from '../../api/order'
import './index.scss'

const TABS: { key: '' | OrderStatus; text: string }[] = [
  { key: '', text: '全部' },
  { key: 'unpaid', text: '待付款' },
  { key: 'unshipped', text: '待发货' },
  { key: 'shipping', text: '待收货' },
  { key: 'unreviewed', text: '待评价' },
  { key: 'after_sale', text: '售后' },
]

const STATUS_TEXT: Record<OrderStatus, string> = {
  unpaid: '待付款',
  unshipped: '待发货',
  shipping: '待收货',
  unreviewed: '待评价',
  completed: '已完成',
  after_sale: '售后中',
  closed: '已关闭',
}

export default function OrderList() {
  const router = useRouter()
  const [active, setActive] = useState<'' | OrderStatus>(
    (router.params.status as OrderStatus) || '',
  )
  const [orders, setOrders] = useState<Order[]>([])

  const load = async (status: '' | OrderStatus) => {
    try {
      const { list } = await apiGetOrders(status ? { status } : undefined)
      setOrders(list)
    } catch {
      // 错误已统一提示
    }
  }

  useDidShow(() => {
    load(active)
  })

  const switchTab = (key: '' | OrderStatus) => {
    setActive(key)
    load(key)
  }

  const goDetail = (id: number) => {
    Taro.navigateTo({ url: `/pages/order-detail/index?id=${id}` })
  }

  return (
    <View className='order-list-page'>
      {/* 状态切换 */}
      <ScrollView className='tabs' scrollX showScrollbar={false}>
        {TABS.map((t) => (
          <View
            className={`tab-item ${active === t.key ? 'active' : ''}`}
            key={t.key || 'all'}
            onClick={() => switchTab(t.key)}
          >
            <Text className='tab-text'>{t.text}</Text>
          </View>
        ))}
      </ScrollView>

      {orders.length === 0 ? (
        <View className='empty'>
          <Text className='empty-icon'>📋</Text>
          <Text className='empty-text'>暂无相关订单</Text>
        </View>
      ) : (
        <View className='order-list'>
          {orders.map((order) => (
            <View
              className='order-card'
              key={order.id}
              onClick={() => goDetail(order.id)}
            >
              <View className='order-card-header'>
                <Text className='order-no'>订单号：{order.orderNo}</Text>
                <Text className='order-status'>
                  {STATUS_TEXT[order.status]}
                </Text>
              </View>
              <View className='order-goods'>
                {order.items.map((item) => (
                  <View className='goods-item' key={item.id}>
                    <Image
                      className='goods-image'
                      src={item.image || ''}
                      mode='aspectFill'
                    />
                    <View className='goods-info'>
                      <Text className='goods-name'>{item.name}</Text>
                      <View className='goods-meta'>
                        <Text className='goods-price'>¥{item.price}</Text>
                        <Text className='goods-qty'>x{item.quantity}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <View className='order-card-footer'>
                <Text className='order-total'>
                  共 {order.items.reduce((s, i) => s + i.quantity, 0)} 件 合计
                  <Text className='total-amount'> ¥{order.totalAmount}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

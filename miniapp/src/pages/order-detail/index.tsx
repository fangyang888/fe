import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import {
  apiGetOrder,
  apiUpdateOrderStatus,
  Order,
  OrderStatus,
  AddressSnapshot,
} from '../../api/order'
import './index.scss'

const STATUS_TEXT: Record<OrderStatus, string> = {
  unpaid: '待付款',
  unshipped: '待发货',
  shipping: '待收货',
  unreviewed: '待评价',
  completed: '已完成',
  after_sale: '售后中',
  closed: '已关闭',
}

export default function OrderDetail() {
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)

  const reload = () => {
    const id = Number(router.params.id)
    if (id) {
      apiGetOrder(id)
        .then(setOrder)
        .catch(() => {})
    }
  }

  useLoad(() => {
    reload()
  })

  const changeStatus = async (
    status: OrderStatus,
    confirmText: string,
    successText: string,
  ) => {
    if (!order) return
    const res = await Taro.showModal({ title: '提示', content: confirmText })
    if (!res.confirm) return
    try {
      await apiUpdateOrderStatus(order.id, status)
      Taro.showToast({ title: successText, icon: 'success' })
      reload()
    } catch {
      // 统一提示
    }
  }

  if (!order) {
    return (
      <View className='order-detail-page'>
        <View className='loading'>加载中...</View>
      </View>
    )
  }

  let addr: AddressSnapshot = {}
  try {
    addr = order.addressSnapshot ? JSON.parse(order.addressSnapshot) : {}
  } catch {
    addr = {}
  }

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <View className='order-detail-page'>
      {/* 状态条 */}
      <View className='status-bar'>
        <Text className='status-text'>{STATUS_TEXT[order.status]}</Text>
      </View>

      {/* 收货地址 */}
      {(addr.name || addr.detail) && (
        <View className='card address-card'>
          <Text className='addr-icon'>📍</Text>
          <View className='addr-info'>
            <View className='addr-line1'>
              <Text className='addr-name'>{addr.name}</Text>
              <Text className='addr-phone'>{addr.phone}</Text>
            </View>
            <Text className='addr-detail'>
              {[addr.province, addr.city, addr.district, addr.detail]
                .filter(Boolean)
                .join(' ')}
            </Text>
          </View>
        </View>
      )}

      {/* 商品 */}
      <View className='card goods-card'>
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

      {/* 订单信息 */}
      <View className='card info-card'>
        <View className='info-row'>
          <Text className='info-label'>订单编号</Text>
          <Text className='info-value'>{order.orderNo}</Text>
        </View>
        <View className='info-row'>
          <Text className='info-label'>下单时间</Text>
          <Text className='info-value'>{order.created_at}</Text>
        </View>
        {order.remark ? (
          <View className='info-row'>
            <Text className='info-label'>备注</Text>
            <Text className='info-value'>{order.remark}</Text>
          </View>
        ) : null}
        <View className='info-row'>
          <Text className='info-label'>商品件数</Text>
          <Text className='info-value'>{totalQty} 件</Text>
        </View>
        <View className='info-row total-row'>
          <Text className='info-label'>实付金额</Text>
          <Text className='total-amount'>¥{order.totalAmount}</Text>
        </View>
      </View>

      {/* 状态操作按钮 */}
      <View className='action-bar'>
        {order.status === 'unpaid' && (
          <>
            <View
              className='act-btn ghost'
              onClick={() =>
                changeStatus('closed', '确定取消该订单?', '已取消')
              }
            >
              <Text className='act-text ghost-text'>取消订单</Text>
            </View>
            <View
              className='act-btn primary'
              onClick={() =>
                changeStatus('unshipped', '确认支付该订单?', '支付成功')
              }
            >
              <Text className='act-text'>去付款</Text>
            </View>
          </>
        )}
        {order.status === 'shipping' && (
          <View
            className='act-btn primary'
            onClick={() =>
              changeStatus('unreviewed', '确认已收到货?', '确认收货成功')
            }
          >
            <Text className='act-text'>确认收货</Text>
          </View>
        )}
        {!['unpaid', 'shipping'].includes(order.status) && (
          <View className='act-btn ghost' onClick={() => Taro.navigateBack()}>
            <Text className='act-text ghost-text'>返回</Text>
          </View>
        )}
      </View>
    </View>
  )
}

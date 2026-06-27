import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { getCart } from '../../store/cartStore'
import { CartItem } from '../../api/cart'
import { apiGetAddresses, Address } from '../../api/address'
import { apiCreateOrder } from '../../api/order'
import { payOrder } from '../../utils/pay'
import { track } from '../../utils/tracker'
import './index.scss'

export default function Checkout() {
  const router = useRouter()
  const [items, setItems] = useState<CartItem[]>([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [address, setAddress] = useState<Address | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadCart = async () => {
    try {
      const { items: all, totalPrice: total } = await getCart()
      setItems(all.filter((i) => i.checked))
      setTotalPrice(total)
    } catch {
      // 统一提示
    }
  }

  const loadAddress = async () => {
    try {
      const list = await apiGetAddresses()
      // 优先用路由传入的地址 id，否则默认地址，否则第一条
      const picked = router.params.addressId
        ? list.find((a) => a.id === Number(router.params.addressId))
        : undefined
      setAddress(
        picked || list.find((a) => a.isDefault === 1) || list[0] || null,
      )
    } catch {
      // 统一提示
    }
  }

  useDidShow(() => {
    loadCart()
    loadAddress()
  })

  useLoad(() => {
    track('checkout_start', {}, 'action')
  })

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)

  const goPickAddress = () => {
    Taro.navigateTo({ url: '/pages/address-list/index' })
  }

  const submit = async () => {
    if (!address) {
      Taro.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }
    if (items.length === 0) {
      Taro.showToast({ title: '没有可结算的商品', icon: 'none' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      const order = await apiCreateOrder({ addressId: address.id })
      track('order_submit', { orderId: order.id, amount: totalPrice }, 'action')

      // 下单成功后直接拉起微信支付
      const result = await payOrder(order.id)
      track(
        'order_pay',
        { orderId: order.id, amount: totalPrice, result },
        'action',
      )

      // 无论支付成功/取消，订单都已创建，统一进订单详情（未付可再次支付）
      setTimeout(() => {
        Taro.redirectTo({ url: `/pages/order-detail/index?id=${order.id}` })
      }, 700)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <View className='checkout-page'>
      {/* 收货地址 */}
      <View className='address-card' onClick={goPickAddress}>
        {address ? (
          <View className='addr-info'>
            <View className='addr-line1'>
              <Text className='addr-name'>{address.name}</Text>
              <Text className='addr-phone'>{address.phone}</Text>
            </View>
            <Text className='addr-detail'>
              {[address.province, address.city, address.district, address.detail]
                .filter(Boolean)
                .join(' ')}
            </Text>
          </View>
        ) : (
          <Text className='addr-empty'>请选择收货地址</Text>
        )}
        <Text className='addr-arrow'>›</Text>
      </View>

      {/* 商品清单 */}
      <ScrollView className='goods-card' scrollY>
        {items.map((item) => (
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
      </ScrollView>

      {/* 金额 */}
      <View className='summary-card'>
        <View className='summary-row'>
          <Text className='summary-label'>商品金额</Text>
          <Text className='summary-value'>¥{totalPrice}</Text>
        </View>
        <View className='summary-row'>
          <Text className='summary-label'>运费</Text>
          <Text className='summary-value'>包邮</Text>
        </View>
      </View>

      {/* 底部提交 */}
      <View className='footer'>
        <View className='footer-total'>
          <Text className='total-label'>合计</Text>
          <Text className='total-amount'>¥{totalPrice}</Text>
        </View>
        <View
          className={`submit-btn ${submitting ? 'disabled' : ''}`}
          onClick={submit}
        >
          <Text className='submit-text'>提交订单 ({totalQty})</Text>
        </View>
      </View>
    </View>
  )
}

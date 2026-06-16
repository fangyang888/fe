import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  getCart,
  updateQuantity,
  removeFromCart,
  setItemChecked,
  setAllChecked,
  CartItem,
} from '../../store/cartStore'
import './index.scss'

export default function Cart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [totalPrice, setTotalPrice] = useState(0)

  const loadCartData = async () => {
    try {
      const { items, totalPrice: total } = await getCart()
      setCartItems(items)
      setTotalPrice(total)
    } catch {
      // 错误已由 request 层统一提示
    }
  }

  useLoad(() => {
    loadCartData()
  })

  useDidShow(() => {
    loadCartData()
  })

  // 增加数量
  const handleIncrease = async (id: number) => {
    const item = cartItems.find(i => i.id === id)
    if (item) {
      await updateQuantity(id, item.quantity + 1)
      loadCartData()
    }
  }

  // 减少数量
  const handleDecrease = async (id: number) => {
    const item = cartItems.find(i => i.id === id)
    if (item && item.quantity > 1) {
      await updateQuantity(id, item.quantity - 1)
      loadCartData()
    }
  }

  // 删除商品
  const handleRemove = async (id: number) => {
    await removeFromCart(id)
    loadCartData()
  }

  // 勾选/取消单项
  const handleToggle = async (item: CartItem) => {
    await setItemChecked(item.id, !item.checked)
    loadCartData()
  }

  // 全选/全不选
  const allChecked = cartItems.length > 0 && cartItems.every((i) => i.checked)
  const handleToggleAll = async () => {
    await setAllChecked(cartItems, !allChecked)
    loadCartData()
  }

  // 去结算
  const handleCheckout = () => {
    if (cartItems.length === 0) {
      Taro.showToast({ title: '购物车是空的', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/checkout/index' })
  }

  // 返回上一页
  const handleBack = () => {
    Taro.navigateBack({ delta: 1 })
  }

  return (
    <View className='cart-page'>
      {/* Header */}
      <View className='cart-header'>
        <View className='back-btn' onClick={handleBack}>
          <Text className='back-icon'>‹</Text>
        </View>
        <Text className='header-title'>购物车</Text>
        <View className='header-placeholder' />
      </View>
      {cartItems.length === 0 ? (
        <View className='empty-cart'>
          <Text className='empty-icon'>🛒</Text>
          <Text className='empty-text'>购物车还是空的</Text>
          <Text className='empty-tip'>快去挑选心仪的商品吧</Text>
        </View>
      ) : (
        <>
          <ScrollView className='cart-list' scrollY enhanced showScrollbar={false}>
            {cartItems.map(item => (
              <View className='cart-item' key={item.id}>
                <View
                  className={`checkbox ${item.checked ? 'checked' : ''}`}
                  onClick={() => handleToggle(item)}
                >
                  {item.checked && <Text className='checkbox-tick'>✓</Text>}
                </View>
                <Image className='item-image' src={item.image || ''} mode='aspectFill' />
                <View className='item-info'>
                  <Text className='item-name'>{item.name}</Text>
                  <View className='item-bottom'>
                    <Text className='item-price'>{item.price}</Text>
                    <View className='quantity-control'>
                      <View className='qty-btn' onClick={() => handleDecrease(item.id)}>
                        <Text>-</Text>
                      </View>
                      <Text className='qty-num'>{item.quantity}</Text>
                      <View className='qty-btn' onClick={() => handleIncrease(item.id)}>
                        <Text>+</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className='remove-btn' onClick={() => handleRemove(item.id)}>
                  <Text>×</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          
          <View className='cart-footer'>
            <View className='select-all' onClick={handleToggleAll}>
              <View className={`checkbox ${allChecked ? 'checked' : ''}`}>
                {allChecked && <Text className='checkbox-tick'>✓</Text>}
              </View>
              <Text className='select-all-text'>全选</Text>
            </View>
            <View className='total-info'>
              <Text className='total-label'>合计：</Text>
              <Text className='total-symbol'>¥</Text>
              <Text className='total-price'>{totalPrice.toFixed(2)}</Text>
            </View>
            <View className='checkout-btn' onClick={handleCheckout}>
              <Text className='checkout-text'>去结算 ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})</Text>
            </View>
          </View>
        </>
      )}
    </View>
  )
}

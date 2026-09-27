import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  getCart,
  updateQuantity,
  removeFromCart,
  setItemChecked,
  setAllChecked,
  CartItem,
} from '../../store/cartStore'
import { PageHeading, EmptyState, ProductImage } from '../../components/ui'
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
    if (!cartItems.some(item => item.checked)) {
      Taro.showToast({ title: '请先选择要结算的商品', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/checkout/index' })
  }

  return (
    <View className='cart-page'>
      <PageHeading title='购物袋' subtitle='把心意，一起带回家' />
      {cartItems.length === 0 ? (
        <EmptyState icon='bag' title='购物袋还空着' description='去发现值得带回家的好东西' action='去逛逛' onAction={() => Taro.switchTab({ url: '/pages/index/index' })} />
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
                <ProductImage className='item-image' src={item.image} onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${item.productId}` })} />
                <View className='item-info'>
                  <Text className='item-name'>{item.name}</Text>
                  <View className='item-bottom'>
                    <Text className='item-price'>¥{item.price}</Text>
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
          
          <View className={`cart-footer ${process.env.TARO_ENV === 'h5' ? 'cart-footer-h5' : ''}`}>
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
              <Text className='checkout-text'>去结算 ({cartItems.filter(item => item.checked).reduce((sum, item) => sum + item.quantity, 0)})</Text>
            </View>
          </View>
        </>
      )}
    </View>
  )
}

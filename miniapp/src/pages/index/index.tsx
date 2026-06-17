import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components'
import Taro, { useLoad, useDidShow, switchTab } from '@tarojs/taro'
import { useState } from 'react'
import { apiGetHome, HomeData, Product } from '../../api/home'
import { addToCart, getCartCount } from '../../store/cartStore'
import { track, trackPageView } from '../../utils/tracker'
import './index.scss'

export default function Index() {
  const [home, setHome] = useState<HomeData>({
    banners: [],
    categories: [],
    recommendProducts: [],
  })
  const { banners, categories, recommendProducts } = home
  const [cartCount, setCartCount] = useState(0)

  const loadHome = async () => {
    try {
      const data = await apiGetHome()
      setHome(data)
    } catch {
      // 错误已由 request 层统一提示
    }
  }

  const loadCartCount = async () => {
    setCartCount(await getCartCount())
  }

  useLoad(() => {
    loadHome()
    loadCartCount()
    trackPageView('/pages/index/index')
  })

  useDidShow(() => {
    loadCartCount()
  })

  // 格式化销量
  const formatSales = (sales: number) => {
    if (sales >= 10000) {
      return (sales / 10000).toFixed(1) + '万'
    }
    return sales.toString()
  }

  // 添加到购物车
  const handleAddToCart = async (product: Product) => {
    track('add_to_cart', { productId: product.id, price: product.price, from: 'home' })
    await addToCart(product.id)
    loadCartCount()
  }

  // 进入商品详情
  const goDetail = (id: number) => {
    track('product_click', { productId: id, from: 'home' })
    Taro.navigateTo({ url: `/pages/product-detail/index?id=${id}` })
  }

  // 跳转到购物车
  const goToCart = () => {
    switchTab({ url: '/pages/cart/index' })
  }

  return (
    <View className='home-page'>
      {/* Banner 轮播 */}
      <View className='banner-section'>
        <Swiper
          className='banner-swiper'
          autoplay
          circular
          indicatorDots
          indicatorColor='rgba(255,255,255,0.5)'
          indicatorActiveColor='#ffffff'
        >
          {banners.map((banner) => (
            <SwiperItem key={banner.id}>
              <Image
                className='banner-image'
                src={banner.image}
                mode='aspectFill'
              />
            </SwiperItem>
          ))}
        </Swiper>
      </View>

      {/* 类目区域 */}
      <View className='category-section'>
        <View className='section-title'>
          <Text className='title-text'>商品分类</Text>
        </View>
        <View className='category-grid'>
          {categories.map((category) => (
            <View className='category-item' key={category.id}>
              <View className='category-icon-wrapper'>
                <Image
                  className='category-icon'
                  src={category.icon || ''}
                  mode='aspectFit'
                />
              </View>
              <Text className='category-name'>{category.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 推荐商品区域 */}
      <View className='recommend-section'>
        <View className='section-title'>
          <Text className='title-text'>为你推荐</Text>
          <Text className='more-text'>查看更多 &gt;</Text>
        </View>
        <View className='product-grid'>
          {recommendProducts.map((product) => (
            <View className='product-card' key={product.id}>
              <Image
                className='product-image'
                src={product.image || ''}
                mode='aspectFill'
                onClick={() => goDetail(product.id)}
              />
              <View className='product-info'>
                <Text
                  className='product-name'
                  onClick={() => goDetail(product.id)}
                >
                  {product.name}
                </Text>
                <View className='product-price-row'>
                  <Text className='price-symbol'>¥</Text>
                  <Text className='price-value'>{product.price}</Text>
                  <Text className='original-price'>¥{product.originalPrice}</Text>
                </View>
                <View className='product-bottom'>
                  <Text className='product-sales'>已售 {formatSales(product.sales)}</Text>
                  <View className='add-cart-btn' onClick={() => handleAddToCart(product)}>
                    <Text className='add-cart-text'>+</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 固定购物车入口 */}
      <View className='fixed-cart' onClick={goToCart}>
        <Text className='cart-icon'>🛒</Text>
        {cartCount > 0 && (
          <View className='cart-badge'>
            <Text className='badge-text'>{cartCount > 99 ? '99+' : cartCount}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

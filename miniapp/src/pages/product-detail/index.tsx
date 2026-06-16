import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { apiGetProduct, Product } from '../../api/home'
import {
  apiCheckFavorite,
  apiAddFavorite,
  apiRemoveFavorite,
} from '../../api/favorite'
import { addToCart } from '../../store/cartStore'
import './index.scss'

export default function ProductDetail() {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [faved, setFaved] = useState(false)

  useLoad(() => {
    const id = Number(router.params.id)
    if (!id) return
    apiGetProduct(id)
      .then(setProduct)
      .catch(() => {})
    apiCheckFavorite(id)
      .then((r) => setFaved(r.favorite))
      .catch(() => {})
  })

  const toggleFav = async () => {
    if (!product) return
    if (faved) {
      await apiRemoveFavorite(product.id)
      setFaved(false)
      Taro.showToast({ title: '已取消收藏', icon: 'none' })
    } else {
      await apiAddFavorite(product.id)
      setFaved(true)
      Taro.showToast({ title: '已收藏', icon: 'success' })
    }
  }

  const addCart = async () => {
    if (!product) return
    await addToCart(product.id)
  }

  const goCart = () => {
    Taro.switchTab({ url: '/pages/cart/index' })
  }

  if (!product) {
    return (
      <View className='product-detail-page'>
        <View className='loading'>加载中...</View>
      </View>
    )
  }

  return (
    <View className='product-detail-page'>
      <Image
        className='main-image'
        src={product.image || ''}
        mode='aspectFill'
      />

      <View className='info-card'>
        <View className='price-row'>
          <Text className='price'>¥{product.price}</Text>
          {product.originalPrice ? (
            <Text className='original'>¥{product.originalPrice}</Text>
          ) : null}
        </View>
        <Text className='name'>{product.name}</Text>
        <View className='meta-row'>
          <Text className='meta'>已售 {product.sales}</Text>
          <Text className='meta'>库存 {product.stock ?? '充足'}</Text>
        </View>
      </View>

      {product.description ? (
        <View className='desc-card'>
          <Text className='desc-title'>商品详情</Text>
          <Text className='desc-text'>{product.description}</Text>
        </View>
      ) : null}

      {/* 底部操作栏 */}
      <View className='action-bar'>
        <View className='icon-btn' onClick={toggleFav}>
          <Text className='icon'>{faved ? '❤️' : '🤍'}</Text>
          <Text className='icon-label'>收藏</Text>
        </View>
        <View className='icon-btn' onClick={goCart}>
          <Text className='icon'>🛒</Text>
          <Text className='icon-label'>购物车</Text>
        </View>
        <View className='add-cart-btn' onClick={addCart}>
          <Text className='add-cart-text'>加入购物车</Text>
        </View>
      </View>
    </View>
  )
}

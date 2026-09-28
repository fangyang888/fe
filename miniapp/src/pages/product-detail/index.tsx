import { formatMoney } from '../../utils/money'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { apiGetProduct, Product } from '../../api/home'
import {
  apiCheckFavorite,
  apiAddFavorite,
  apiRemoveFavorite,
} from '../../api/favorite'
import { addToCart } from '../../store/cartStore'
import { track } from '../../utils/tracker'
import { Icon, ProductImage, EmptyState } from '../../components/ui'
import './index.scss'

export default function ProductDetail() {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [faved, setFaved] = useState(false)
  const [failed, setFailed] = useState(false)

  useLoad(() => {
    const id = Number(router.params.id)
    if (!id) { setFailed(true); return }
    track('product_detail_view', { productId: id }, 'pageview')
    apiGetProduct(id)
      .then(setProduct)
      .catch(() => setFailed(true))
    apiCheckFavorite(id)
      .then((r) => setFaved(r.favorite))
      .catch(() => {})
  })

  const toggleFav = async () => {
    if (!product) return
    if (faved) {
      await apiRemoveFavorite(product.id)
      setFaved(false)
      track('favorite_remove', { productId: product.id })
      Taro.showToast({ title: '已取消收藏', icon: 'none' })
    } else {
      await apiAddFavorite(product.id)
      setFaved(true)
      track('favorite_add', { productId: product.id })
      Taro.showToast({ title: '已收藏', icon: 'success' })
    }
  }

  const addCart = async () => {
    if (!product || product.stock === 0) return
    await addToCart(product.id)
  }

  const goCart = () => {
    Taro.switchTab({ url: '/pages/cart/index' })
  }

  if (!product) {
    return (
      <View className='product-detail-page'>
        {failed ? <EmptyState title='暂时无法查看商品' description='商品可能已下架，请返回首页看看其他好物' action='返回首页' onAction={() => Taro.switchTab({ url: '/pages/index/index' })} /> : <View className='loading'>正在加载商品…</View>}
      </View>
    )
  }

  return (
    <View className='product-detail-page'>
      <ProductImage
        className='main-image'
        src={product.image || ''}
      />

      <View className='info-card'>
        <View className='price-row'>
          <Text className='price'>¥{formatMoney(product.price)}</Text>
          {product.originalPrice ? (
            <Text className='original'>¥{formatMoney(product.originalPrice)}</Text>
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
          <Icon name='heart' className={faved ? 'is-favorite' : ''} />
          <Text className='icon-label'>{faved ? '已收藏' : '收藏'}</Text>
        </View>
        <View className='icon-btn' onClick={goCart}>
          <Icon name='bag' />
          <Text className='icon-label'>购物车</Text>
        </View>
        <View className={`detail-add-cart-btn ${product.stock === 0 ? 'is-disabled' : ''}`} onClick={addCart}>
          <Text className='add-cart-text'>{product.stock === 0 ? '暂时缺货' : '加入购物车'}</Text>
        </View>
      </View>
    </View>
  )
}

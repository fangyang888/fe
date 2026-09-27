import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  apiGetFavorites,
  apiRemoveFavorite,
  FavoriteItem,
} from '../../api/favorite'
import { addToCart } from '../../store/cartStore'
import { apiGetProduct } from '../../api/home'
import { PageHeading, ProductImage, EmptyState } from '../../components/ui'
import './index.scss'

export default function FavoritePage() {
  const [list, setList] = useState<FavoriteItem[]>([])

  const load = async () => {
    try {
      setList(await apiGetFavorites())
    } catch {
      // 统一提示
    }
  }

  useDidShow(() => {
    load()
  })

  const remove = async (productId: number) => {
    const res = await Taro.showModal({ title: '提示', content: '取消收藏该商品?' })
    if (res.confirm) {
      await apiRemoveFavorite(productId)
      load()
    }
  }

  const addCart = async (productId: number) => {
    const product = await apiGetProduct(productId)
    if (product.stock === 0) {
      Taro.showToast({ title: '商品暂时缺货', icon: 'none' })
      return
    }
    await addToCart(productId)
  }

  return (
    <View className='favorite-page'>
      <PageHeading title='把喜欢，留在这里' subtitle='下次见面，依然心动' />
      {list.length === 0 ? (
        <EmptyState icon='heart' title='把喜欢的好物收藏起来' description='在商品详情中点击收藏，就能在这里找到它' />
      ) : (
        <View className='list'>
          {list.map((item) => (
            <View className='fav-card' key={item.id}>
              <ProductImage
                className='fav-image'
                onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${item.productId}` })}
                src={item.image || ''}
                />
              <View className='fav-info'>
                <Text className='fav-name' onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${item.productId}` })}>{item.name}</Text>
                <View className='fav-price-row'>
                  <Text className='fav-price'>¥{item.price}</Text>
                  {item.originalPrice ? (
                    <Text className='fav-original'>¥{item.originalPrice}</Text>
                  ) : null}
                </View>
                <View className='fav-actions'>
                  <Text
                    className='action-btn'
                    onClick={() => remove(item.productId)}
                  >
                    取消收藏
                  </Text>
                  <View
                    className='cart-btn'
                    onClick={() => addCart(item.productId)}
                  >
                    <Text className='cart-btn-text'>加入购物车</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

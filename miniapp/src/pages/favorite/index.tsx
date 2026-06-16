import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  apiGetFavorites,
  apiRemoveFavorite,
  FavoriteItem,
} from '../../api/favorite'
import { addToCart } from '../../store/cartStore'
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
    await addToCart(productId)
  }

  return (
    <View className='favorite-page'>
      {list.length === 0 ? (
        <View className='empty'>
          <Text className='empty-icon'>❤️</Text>
          <Text className='empty-text'>还没有收藏的商品</Text>
        </View>
      ) : (
        <View className='list'>
          {list.map((item) => (
            <View className='fav-card' key={item.id}>
              <Image
                className='fav-image'
                src={item.image || ''}
                mode='aspectFill'
              />
              <View className='fav-info'>
                <Text className='fav-name'>{item.name}</Text>
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

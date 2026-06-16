import Taro from '@tarojs/taro'
import {
  apiGetCart,
  apiAddCart,
  apiUpdateCartQty,
  apiSetCartChecked,
  apiRemoveCartItem,
  apiClearCart,
  CartData,
  CartItem,
} from '../api/cart'

export type { CartItem, CartData }

/** 获取购物车（含合计） */
export const getCart = (): Promise<CartData> => apiGetCart()

/** 购物车商品数量（角标用） */
export const getCartCount = async (): Promise<number> => {
  try {
    const { totalQuantity } = await apiGetCart()
    return totalQuantity
  } catch {
    return 0
  }
}

/** 加入购物车 */
export const addToCart = async (productId: number, quantity = 1) => {
  const data = await apiAddCart(productId, quantity)
  Taro.showToast({ title: '已加入购物车', icon: 'success' })
  return data
}

/** 改数量（<=0 删除） */
export const updateQuantity = (id: number, quantity: number) =>
  apiUpdateCartQty(id, quantity)

/** 勾选/取消单项 */
export const setItemChecked = (id: number, checked: boolean) =>
  apiSetCartChecked(id, checked)

/** 全选/全不选（逐项设置） */
export const setAllChecked = async (items: CartItem[], checked: boolean) => {
  await Promise.all(
    items
      .filter((i) => i.checked !== checked)
      .map((i) => apiSetCartChecked(i.id, checked)),
  )
}

/** 删除单项 */
export const removeFromCart = (id: number) => apiRemoveCartItem(id)

/** 清空 */
export const clearCart = () => apiClearCart()

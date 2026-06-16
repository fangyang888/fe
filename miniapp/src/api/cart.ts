import { http } from '../utils/request'

export interface CartItem {
  id: number
  productId: number
  name: string
  price: number
  image?: string
  quantity: number
  checked: boolean
}

export interface CartData {
  items: CartItem[]
  totalQuantity: number
  totalPrice: number
}

/** 获取购物车 */
export const apiGetCart = () => http.get<CartData>('/api/cart')

/** 加入购物车 */
export const apiAddCart = (productId: number, quantity = 1) =>
  http.post<CartData>('/api/cart', { productId, quantity })

/** 改数量（0 则删除） */
export const apiUpdateCartQty = (id: number, quantity: number) =>
  http.put<CartData>(`/api/cart/${id}`, { quantity })

/** 勾选/取消 */
export const apiSetCartChecked = (id: number, checked: boolean) =>
  http.put<CartData>(`/api/cart/${id}/checked`, { checked })

/** 删除单项 */
export const apiRemoveCartItem = (id: number) =>
  http.delete<CartData>(`/api/cart/${id}`)

/** 清空 */
export const apiClearCart = () => http.delete<CartData>('/api/cart')

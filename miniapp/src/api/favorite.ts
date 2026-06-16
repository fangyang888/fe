import { http } from '../utils/request'

export interface FavoriteItem {
  id: number
  productId: number
  name: string
  price: number
  originalPrice?: number
  image?: string
  sales: number
}

/** 我的收藏 */
export const apiGetFavorites = () => http.get<FavoriteItem[]>('/api/favorite')

/** 是否已收藏 */
export const apiCheckFavorite = (productId: number) =>
  http.get<{ favorite: boolean }>(`/api/favorite/check/${productId}`)

/** 添加收藏 */
export const apiAddFavorite = (productId: number) =>
  http.post<{ ok: boolean }>('/api/favorite', { productId })

/** 取消收藏 */
export const apiRemoveFavorite = (productId: number) =>
  http.delete<{ ok: boolean }>(`/api/favorite/${productId}`)

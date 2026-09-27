import { http } from '../utils/request'

export interface Banner {
  id: number
  image: string
  title?: string
  link?: string
}

export interface Category {
  id: number
  name: string
  icon?: string
}

export interface Product {
  id: number
  name: string
  price: number
  originalPrice?: number
  image?: string
  sales: number
  stock?: number
  description?: string
}

export interface HomeData {
  banners: Banner[]
  categories: Category[]
  recommendProducts: Product[]
}

/** 首页聚合数据 */
export const apiGetHome = () =>
  http.get<HomeData>('/api/home', { auth: false })

export interface ProductPage {
  list: Product[]
  total: number
  page: number
  pageSize: number
}

/** 商品列表 */
export const apiGetProducts = (params?: {
  categoryId?: number
  keyword?: string
  page?: number
  pageSize?: number
  sort?: 'sales' | 'price' | 'newest'
}) => {
  const qs = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return http.get<ProductPage>(`/api/product${qs ? `?${qs}` : ''}`, {
    auth: false,
  })
}

/** 商品详情 */
export const apiGetProduct = (id: number) =>
  http.get<Product>(`/api/product/${id}`, { auth: false })

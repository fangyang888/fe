import { http } from './client'

// ===== 分类 =====
export interface Category {
  id: number
  name: string
  icon?: string
  sort: number
  status: number
}
export type CategoryInput = Omit<Category, 'id'>

export const getCategories = () => http.get<Category[]>('/api/admin/category')
export const createCategory = (d: Partial<CategoryInput>) =>
  http.post<Category>('/api/admin/category', d)
export const updateCategory = (id: number, d: Partial<CategoryInput>) =>
  http.put<Category>(`/api/admin/category/${id}`, d)
export const deleteCategory = (id: number) =>
  http.delete<{ ok: boolean }>(`/api/admin/category/${id}`)

// ===== 轮播 =====
export interface Banner {
  id: number
  image: string
  title?: string
  link?: string
  sort: number
  status: number
}
export type BannerInput = Omit<Banner, 'id'>

export const getBanners = () => http.get<Banner[]>('/api/admin/banner')
export const createBanner = (d: Partial<BannerInput>) =>
  http.post<Banner>('/api/admin/banner', d)
export const updateBanner = (id: number, d: Partial<BannerInput>) =>
  http.put<Banner>(`/api/admin/banner/${id}`, d)
export const deleteBanner = (id: number) =>
  http.delete<{ ok: boolean }>(`/api/admin/banner/${id}`)

// ===== 优惠券 =====
export type CouponType = 'amount' | 'discount'
export interface Coupon {
  id: number
  name: string
  type: CouponType
  value: number
  minSpend: number
  expireAt?: string
  status: number
}
export type CouponInput = Omit<Coupon, 'id'>

export const getCoupons = () => http.get<Coupon[]>('/api/admin/coupon')
export const createCoupon = (d: Partial<CouponInput>) =>
  http.post<Coupon>('/api/admin/coupon', d)
export const updateCoupon = (id: number, d: Partial<CouponInput>) =>
  http.put<Coupon>(`/api/admin/coupon/${id}`, d)
export const deleteCoupon = (id: number) =>
  http.delete<{ ok: boolean }>(`/api/admin/coupon/${id}`)

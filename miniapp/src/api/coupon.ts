import { http } from '../utils/request'

export type CouponType = 'amount' | 'discount'
export type UserCouponStatus = 'unused' | 'used' | 'expired'

export interface Coupon {
  id: number
  name: string
  type: CouponType
  value: number
  minSpend: number
  expireAt?: string
  status: number
}

export interface MyCoupon {
  id: number
  couponId: number
  name: string
  type: CouponType
  value: number
  minSpend: number
  expireAt?: string
  status: UserCouponStatus
}

/** 可领取的优惠券 */
export const apiGetCoupons = () =>
  http.get<Coupon[]>('/api/coupon', { auth: false })

/** 我的优惠券 */
export const apiGetMyCoupons = (status?: UserCouponStatus) =>
  http.get<MyCoupon[]>(`/api/coupon/mine${status ? `?status=${status}` : ''}`)

/** 领取优惠券 */
export const apiClaimCoupon = (id: number) =>
  http.post<{ ok: boolean }>(`/api/coupon/${id}/claim`)

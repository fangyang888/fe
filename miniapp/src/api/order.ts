import { http } from '../utils/request'

export type OrderStatus =
  | 'unpaid'
  | 'unshipped'
  | 'shipping'
  | 'unreviewed'
  | 'completed'
  | 'after_sale'
  | 'closed'

export interface OrderItem {
  id: number
  productId: number
  name: string
  price: number
  image?: string
  quantity: number
}

export interface Order {
  id: number
  orderNo: string
  status: OrderStatus
  totalAmount: number
  remark?: string
  addressSnapshot?: string
  items: OrderItem[]
  created_at: string
}

export interface AddressSnapshot {
  name?: string
  phone?: string
  province?: string
  city?: string
  district?: string
  detail?: string
}

export interface OrderSummary {
  unpaid: number
  unshipped: number
  shipping: number
  unreviewed: number
  afterSale: number
}

export interface OrderPage {
  list: Order[]
  total: number
  page: number
  pageSize: number
}

/** 各状态订单数量（我的页角标） */
export const apiGetOrderSummary = () =>
  http.get<OrderSummary>('/api/order/summary')

/** 订单列表 */
export const apiGetOrders = (params?: {
  status?: OrderStatus
  page?: number
  pageSize?: number
}) => {
  const qs = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [k, v]) => {
      if (v !== undefined && v !== null) acc[k] = String(v)
      return acc
    }, {} as Record<string, string>),
  ).toString()
  return http.get<OrderPage>(`/api/order${qs ? `?${qs}` : ''}`)
}

/** 订单详情 */
export const apiGetOrder = (id: number) => http.get<Order>(`/api/order/${id}`)

/** 用购物车勾选项下单 */
export const apiCreateOrder = (data?: {
  addressId?: number
  remark?: string
}) => http.post<Order>('/api/order', data || {})

/** 修改订单状态（付款/取消/确认收货等） */
export const apiUpdateOrderStatus = (id: number, status: OrderStatus) =>
  http.put<Order>(`/api/order/${id}/status`, { status })

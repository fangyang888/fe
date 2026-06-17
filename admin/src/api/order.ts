import { http } from './client'

export type OrderStatus =
  | 'unpaid'
  | 'unshipped'
  | 'shipping'
  | 'unreviewed'
  | 'completed'
  | 'after_sale'
  | 'closed'

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  unpaid: '待付款',
  unshipped: '待发货',
  shipping: '待收货',
  unreviewed: '待评价',
  completed: '已完成',
  after_sale: '售后中',
  closed: '已关闭',
}

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
  userId: number
  status: OrderStatus
  totalAmount: number
  remark?: string
  items: OrderItem[]
  created_at: string
}

export interface OrderPage {
  list: Order[]
  total: number
  page: number
  pageSize: number
}

export const getOrders = (
  page = 1,
  pageSize = 20,
  status?: OrderStatus | '',
) =>
  http.get<OrderPage>(
    `/api/admin/order?page=${page}&pageSize=${pageSize}` +
      (status ? `&status=${status}` : ''),
  )

export const updateOrderStatus = (id: number, status: OrderStatus) =>
  http.put<Order>(`/api/admin/order/${id}/status`, { status })

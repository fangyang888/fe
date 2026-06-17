import { http } from './client'

export interface Product {
  id: number
  name: string
  price: number
  originalPrice?: number
  image?: string
  sales: number
  stock: number
  categoryId?: number
  description?: string
  isRecommend: number
  status: number
}

export interface ProductPage {
  list: Product[]
  total: number
  page: number
  pageSize: number
}

export type ProductInput = Omit<Product, 'id' | 'sales'> & { sales?: number }

export const getProducts = (page = 1, pageSize = 20, keyword = '') =>
  http.get<ProductPage>(
    `/api/admin/product?page=${page}&pageSize=${pageSize}` +
      (keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''),
  )

export const createProduct = (data: ProductInput) =>
  http.post<Product>('/api/admin/product', data)

export const updateProduct = (id: number, data: Partial<ProductInput>) =>
  http.put<Product>(`/api/admin/product/${id}`, data)

export const deleteProduct = (id: number) =>
  http.delete<{ ok: boolean }>(`/api/admin/product/${id}`)

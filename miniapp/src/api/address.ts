import { http } from '../utils/request'

export interface Address {
  id: number
  name: string
  phone: string
  province?: string
  city?: string
  district?: string
  detail: string
  isDefault: number
}

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & {
  isDefault?: boolean
}

export const apiGetAddresses = () => http.get<Address[]>('/api/address')

export const apiCreateAddress = (data: AddressInput) =>
  http.post<Address>('/api/address', data)

export const apiUpdateAddress = (id: number, data: Partial<AddressInput>) =>
  http.put<Address>(`/api/address/${id}`, data)

export const apiSetDefaultAddress = (id: number) =>
  http.put<{ ok: boolean }>(`/api/address/${id}/default`)

export const apiRemoveAddress = (id: number) =>
  http.delete<{ ok: boolean }>(`/api/address/${id}`)

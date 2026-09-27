import { request } from './client'

export function uploadImage(file: File, signal?: AbortSignal) {
  const body = new FormData()
  body.append('file', file)
  return request<{ url: string; filename: string; size: number }>('/api/admin/uploads/images', {
    method: 'POST', body, signal,
  })
}

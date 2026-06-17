import { http } from './client'

export interface EventCount {
  eventName: string
  count: number
}

export interface Overview {
  date: string
  pv: number
  uv: number
  events: EventCount[]
}

export const getOverview = (date?: string) =>
  http.get<Overview>(`/api/track/overview${date ? `?date=${date}` : ''}`)

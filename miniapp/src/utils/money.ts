/** 接口金额单位为元，仅在展示时补足两位；合计以服务端整数分计算为准。 */
export const formatMoney = (value: number | string | null | undefined): string =>
  value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'

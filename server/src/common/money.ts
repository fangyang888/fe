import { BadRequestException } from '@nestjs/common';
import type { ValueTransformer } from 'typeorm';

// DECIMAL(12,2)，接口保持元；计算使用整数分，避免浮点累计误差。
export const MAX_CENTS = 999_999_999_999;
export function toCents(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) {
    throw new BadRequestException('金额必须为非负数，最多两位小数');
  }
  const [yuan, fraction = ''] = String(value).split('.');
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) throw new BadRequestException('金额超出范围');
  return cents;
}
export function fromCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) throw new BadRequestException('金额超出范围');
  return cents / 100;
}
export function lineCents(price: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new BadRequestException('商品数量必须为正整数');
  const cents = toCents(price) * quantity;
  fromCents(cents);
  return cents;
}
export const moneyTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value == null ? value : (toCents(value) / 100).toFixed(2),
  from: (value: string | number | null) => value == null ? value : Number(value),
};

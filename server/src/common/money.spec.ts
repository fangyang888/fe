import { ConfigService } from '@nestjs/config';
import { getMetadataArgsStorage } from 'typeorm';
import { fromCents, lineCents, moneyTransformer, toCents } from './money';
import { Product } from '../product/product.entity';
import { ProductService } from '../product/product.service';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { CartService } from '../cart/cart.service';
import { OrderService } from '../order/order.service';
import { PayService } from '../order/pay.service';

describe('Decimal commerce amounts', () => {
  it.each([[9.9, 990], [0.01, 1], [89, 8900], [19.99, 1999], [0.29, 29], ['9.90', 990]])(
    'converts %s yuan to %s cents without rounding away precision', (yuan, cents) => {
      expect(toCents(yuan)).toBe(cents);
    },
  );
  it.each([NaN, Infinity, -1, 1.001, '', null, {}, '1e2', '12x', 10000000000])('rejects invalid money %#', (value) => {
    expect(() => toCents(value)).toThrow();
  });
  it('preserves historical yuan values and nullable prices through database conversion', () => {
    expect(moneyTransformer.to(89)).toBe('89.00');
    expect(moneyTransformer.from('9.90')).toBe(9.9);
    expect(moneyTransformer.from(null)).toBeNull();
    expect(fromCents(lineCents(9.9, 3))).toBe(29.7);
    expect(fromCents(lineCents(0.1, 1) + lineCents(0.2, 1))).toBe(0.3);
    expect(() => lineCents(9.9, 0.5)).toThrow();
    expect(() => lineCents(9999999999.99, 2)).toThrow();
    for (const [target, fields] of [[Product, ['price', 'originalPrice']], [Order, ['totalAmount']], [OrderItem, ['price']]] as const) {
      for (const field of fields) {
        const column = getMetadataArgsStorage().columns.find((entry) => entry.target === target && entry.propertyName === field);
        expect(column?.options).toMatchObject({ type: 'decimal', precision: 12, scale: 2, transformer: moneyTransformer });
      }
    }
  });

  it('validates product prices before persistence and permits clearing the optional original price', async () => {
    const repo = { create: jest.fn((data) => data), save: jest.fn(async (data) => data), findOne: jest.fn(async () => ({ id: 1, price: 89, originalPrice: 99 })) };
    const service = new ProductService(repo as any);
    expect(await service.create({ name: '测试', price: 9.9 })).toMatchObject({ price: 9.9 });
    await expect(service.update(1, { price: 1.001 })).rejects.toThrow();
    expect(() => service.create({ price: 0 })).toThrow();
    expect(await service.update(1, { originalPrice: null })).toMatchObject({ price: 89, originalPrice: null });
  });

  it('uses the same cent totals for checked cart items, order snapshots and the payment request', async () => {
    const products = [{ id: 1, name: '商品A', price: 9.9, stock: 10, sales: 0, status: 1 }, { id: 2, name: '商品B', price: 0.1, stock: 10, sales: 0, status: 1 }];
    const cart = [{ id: 1, productId: 1, quantity: 3, checked: 1 }, { id: 2, productId: 2, quantity: 2, checked: 1 }];
    const productRepo = { find: jest.fn(async () => products) };
    const cartRepo = { find: jest.fn(async () => cart) };
    const result = await new CartService(cartRepo as any, productRepo as any).getCart(1);
    expect(result.totalPrice).toBe(29.9);
    const manager = { save: jest.fn(async (_entity, data) => data), delete: jest.fn() };
    const orders = new OrderService({} as any, cartRepo as any, productRepo as any,
      { getDefault: async () => ({ id: 1, name: '测试收货人' }) } as any,
      { transaction: async (work: (manager: unknown) => Promise<unknown>) => work(manager) } as any);
    const order = await orders.createFromCart(1, {});
    expect(order.totalAmount).toBe(result.totalPrice);
    expect(order.items.map((item) => item.price)).toEqual([9.9, 0.1]);

    const pay = new PayService(new ConfigService({ WX_APPID: 'test', WXPAY_MCHID: 'test', WXPAY_API_V3_KEY: 'test', WXPAY_SERIAL_NO: 'test', WXPAY_PRIVATE_KEY: 'test', WXPAY_NOTIFY_URL: 'https://example.test/notify' }));
    jest.spyOn(pay as any, 'rsaSign').mockReturnValue('test-signature');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 200, text: async () => JSON.stringify({ prepay_id: 'test-prepay' }) } as Response);
    try {
      await pay.createJsapiPayment(order, 'test-openid');
      expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).amount).toEqual({ total: 2990, currency: 'CNY' });
    } finally { fetchMock.mockRestore(); }
  });
});

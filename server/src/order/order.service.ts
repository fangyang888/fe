import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../product/product.entity';
import { AddressService } from '../address/address.service';

export interface CreateOrderDto {
  /** 收货地址 id，不传则用默认地址 */
  addressId?: number;
  remark?: string;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(CartItem) private readonly cartRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly addressService: AddressService,
    private readonly dataSource: DataSource,
  ) {}

  /** 各状态订单数量（我的页角标） */
  async summary(userId: number) {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.userId = :userId', { userId })
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string }>();

    const map = new Map<string, number>(
      rows.map((r) => [r.status, Number(r.count)]),
    );
    return {
      unpaid: map.get('unpaid') || 0,
      unshipped: map.get('unshipped') || 0,
      shipping: map.get('shipping') || 0,
      unreviewed: map.get('unreviewed') || 0,
      afterSale: map.get('after_sale') || 0,
    };
  }

  /** 订单列表，可按状态过滤 */
  async findAll(
    userId: number,
    status?: OrderStatus,
    page = 1,
    pageSize = 10,
  ) {
    const where: any = { userId };
    if (status) where.status = status;
    const [list, total] = await this.orderRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findOne(userId: number, id: number) {
    const order = await this.orderRepo.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  /** 用购物车勾选项下单（事务：建单、扣库存、清购物车） */
  async createFromCart(userId: number, dto: CreateOrderDto) {
    const cartItems = await this.cartRepo.find({
      where: { userId, checked: 1 },
    });
    if (cartItems.length === 0) {
      throw new BadRequestException('购物车没有勾选的商品');
    }

    // 收货地址快照
    const address = dto.addressId
      ? await this.addressService.findOne(userId, dto.addressId)
      : await this.addressService.getDefault(userId);
    if (!address) throw new BadRequestException('请先选择收货地址');

    const products = await this.productRepo.find({
      where: { id: In(cartItems.map((c) => c.productId)) },
    });
    const pmap = new Map(products.map((p) => [p.id, p]));

    return this.dataSource.transaction(async (manager) => {
      const items: OrderItem[] = [];
      let totalAmount = 0;

      for (const ci of cartItems) {
        const p = pmap.get(ci.productId);
        if (!p || p.status !== 1) {
          throw new BadRequestException(`商品已下架: ${ci.productId}`);
        }
        if (p.stock < ci.quantity) {
          throw new BadRequestException(`库存不足: ${p.name}`);
        }
        // 扣库存、加销量
        p.stock -= ci.quantity;
        p.sales += ci.quantity;
        await manager.save(Product, p);

        const oi = new OrderItem();
        oi.productId = p.id;
        oi.name = p.name;
        oi.price = p.price;
        oi.image = p.image;
        oi.quantity = ci.quantity;
        items.push(oi);
        totalAmount += p.price * ci.quantity;
      }

      const order = new Order();
      order.orderNo = this.genOrderNo();
      order.userId = userId;
      order.status = 'unpaid';
      order.totalAmount = totalAmount;
      order.addressSnapshot = JSON.stringify(address);
      order.remark = dto.remark;
      order.items = items;
      const saved = await manager.save(Order, order);

      // 清掉已下单的购物车项
      await manager.delete(CartItem, { id: In(cartItems.map((c) => c.id)) });

      return saved;
    });
  }

  /** 简化的状态流转（付款 / 发货 / 收货等），实际项目按需拆 */
  async updateStatus(userId: number, id: number, status: OrderStatus) {
    const order = await this.findOne(userId, id);
    order.status = status;
    if (status === 'unshipped') order.paidAt = new Date();
    return this.orderRepo.save(order);
  }

  // ---------- 后台管理（跨用户） ----------

  /** 后台全量订单列表，可按状态过滤 */
  async adminFindAll(status?: OrderStatus, page = 1, pageSize = 20) {
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await this.orderRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async adminFindOne(id: number) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  /** 后台改订单状态（不限用户）。常用于发货：shipping */
  async adminUpdateStatus(id: number, status: OrderStatus) {
    const order = await this.adminFindOne(id);
    order.status = status;
    return this.orderRepo.save(order);
  }

  private genOrderNo(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${ts}${rand}`;
  }
}

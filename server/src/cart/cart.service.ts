import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CartItem } from './cart-item.entity';
import { Product } from '../product/product.entity';

export interface CartItemView {
  id: number;
  productId: number;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  checked: boolean;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  /** 当前用户购物车：关联商品信息 + 合计 */
  async getCart(userId: number) {
    const rows = await this.cartRepo.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });

    const productIds = rows.map((r) => r.productId);
    const products = productIds.length
      ? await this.productRepo.find({ where: { id: In(productIds) } })
      : [];
    const map = new Map(products.map((p) => [p.id, p]));

    const items: CartItemView[] = rows
      .filter((r) => map.has(r.productId)) // 过滤已删除商品
      .map((r) => {
        const p = map.get(r.productId)!;
        return {
          id: r.id,
          productId: r.productId,
          name: p.name,
          price: p.price,
          image: p.image,
          quantity: r.quantity,
          checked: r.checked === 1,
        };
      });

    const checkedItems = items.filter((i) => i.checked);
    return {
      items,
      totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
      // 合计只算勾选项
      totalPrice: checkedItems.reduce((s, i) => s + i.price * i.quantity, 0),
    };
  }

  /** 加入购物车（已存在则累加） */
  async add(userId: number, productId: number, quantity = 1) {
    if (quantity <= 0) throw new BadRequestException('数量必须大于 0');
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product || product.status !== 1) {
      throw new NotFoundException('商品不存在或已下架');
    }

    let item = await this.cartRepo.findOne({ where: { userId, productId } });
    if (item) {
      item.quantity += quantity;
    } else {
      item = this.cartRepo.create({ userId, productId, quantity, checked: 1 });
    }
    await this.cartRepo.save(item);
    return this.getCart(userId);
  }

  /** 改数量，<=0 则删除 */
  async updateQuantity(userId: number, id: number, quantity: number) {
    const item = await this.cartRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('购物车项不存在');
    if (quantity <= 0) {
      await this.cartRepo.remove(item);
    } else {
      item.quantity = quantity;
      await this.cartRepo.save(item);
    }
    return this.getCart(userId);
  }

  /** 勾选 / 取消 */
  async setChecked(userId: number, id: number, checked: boolean) {
    const item = await this.cartRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('购物车项不存在');
    item.checked = checked ? 1 : 0;
    await this.cartRepo.save(item);
    return this.getCart(userId);
  }

  /** 删除单项 */
  async remove(userId: number, id: number) {
    await this.cartRepo.delete({ id, userId });
    return this.getCart(userId);
  }

  /** 清空 */
  async clear(userId: number) {
    await this.cartRepo.delete({ userId });
    return this.getCart(userId);
  }
}

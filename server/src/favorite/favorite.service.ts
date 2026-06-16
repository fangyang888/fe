import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { Product } from '../product/product.entity';

export interface FavoriteView {
  id: number;
  productId: number;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string;
  sales: number;
}

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favRepo: Repository<Favorite>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  /** 我的收藏（关联商品信息，过滤已下架/删除） */
  async list(userId: number): Promise<FavoriteView[]> {
    const rows = await this.favRepo.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });
    if (rows.length === 0) return [];

    const products = await this.productRepo.find({
      where: { id: In(rows.map((r) => r.productId)) },
    });
    const map = new Map(products.map((p) => [p.id, p]));

    return rows
      .filter((r) => map.has(r.productId))
      .map((r) => {
        const p = map.get(r.productId)!;
        return {
          id: r.id,
          productId: p.id,
          name: p.name,
          price: p.price,
          originalPrice: p.originalPrice,
          image: p.image,
          sales: p.sales,
        };
      });
  }

  /** 添加收藏（幂等） */
  async add(userId: number, productId: number) {
    const exists = await this.favRepo.findOne({
      where: { userId, productId },
    });
    if (!exists) {
      await this.favRepo.save(this.favRepo.create({ userId, productId }));
    }
    return { ok: true };
  }

  /** 取消收藏 */
  async remove(userId: number, productId: number) {
    await this.favRepo.delete({ userId, productId });
    return { ok: true };
  }

  /** 是否已收藏 */
  async isFavorite(userId: number, productId: number) {
    const exists = await this.favRepo.findOne({
      where: { userId, productId },
    });
    return { favorite: !!exists };
  }
}

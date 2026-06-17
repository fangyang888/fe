import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Product } from './product.entity';

export interface ProductQuery {
  categoryId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
  /** sales | price | newest，默认 newest */
  sort?: 'sales' | 'price' | 'newest';
}

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  /** 商品分页列表，支持分类/关键词/排序 */
  async findAll(query: ProductQuery) {
    const { categoryId, keyword, sort = 'newest' } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

    const where: any = { status: 1 };
    if (categoryId) where.categoryId = categoryId;
    if (keyword) where.name = Like(`%${keyword}%`);

    const orderMap = {
      sales: { sales: 'DESC' as const },
      price: { price: 'ASC' as const },
      newest: { created_at: 'DESC' as const },
    };

    const [list, total] = await this.repo.findAndCount({
      where,
      order: orderMap[sort],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /** 首页推荐商品 */
  findRecommend(limit = 10) {
    return this.repo.find({
      where: { status: 1, isRecommend: 1 },
      order: { sales: 'DESC' },
      take: limit,
    });
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.repo.findOne({ where: { id } });
    if (!product || product.status !== 1) {
      throw new NotFoundException('商品不存在或已下架');
    }
    return product;
  }

  // ---------- 后台管理 ----------

  /** 后台列表：含下架商品，支持关键词/分类，分页 */
  async findAllAdmin(query: ProductQuery) {
    const { categoryId, keyword } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (keyword) where.name = Like(`%${keyword}%`);

    const [list, total] = await this.repo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /** 后台取单个（不限状态） */
  async findOneAdmin(id: number): Promise<Product> {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('商品不存在');
    return product;
  }

  create(data: Partial<Product>): Promise<Product> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Product>): Promise<Product> {
    const product = await this.findOneAdmin(id);
    Object.assign(product, data);
    return this.repo.save(product);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 商品。价格暂用「元」整数存（与现有前端 homeData 对齐）。
 * 若后续要支持小数/避免浮点，建议改为「分」整数，接口层再换算。
 */
@Entity('product')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** 现价（元） */
  @Column({ type: 'int' })
  price: number;

  /** 原价（元），划线价，可空 */
  @Column({ type: 'int', nullable: true })
  originalPrice?: number;

  /** 主图 URL */
  @Column({ nullable: true })
  image?: string;

  /** 销量 */
  @Column({ type: 'int', default: 0 })
  sales: number;

  /** 库存 */
  @Column({ type: 'int', default: 0 })
  stock: number;

  /** 所属分类 id */
  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId?: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** 是否首页推荐 1是 0否 */
  @Column({ type: 'tinyint', default: 0 })
  isRecommend: number;

  /** 1上架 0下架 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

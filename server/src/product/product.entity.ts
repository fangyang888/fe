import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { moneyTransformer } from '../common/money';

/**
 * 价格以元存储为定点小数，接口返回数字，金额计算使用整数分。
 */
@Entity('product')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** 现价（元） */
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: moneyTransformer })
  price: number;

  /** 原价（元），划线价，可空 */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: moneyTransformer })
  originalPrice?: number | null;

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

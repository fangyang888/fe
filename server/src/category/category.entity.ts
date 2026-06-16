import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** 商品分类 */
@Entity('category')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** 分类图标 URL */
  @Column({ nullable: true })
  icon?: string;

  /** 排序值，越小越靠前 */
  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 1显示 0隐藏 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;
}

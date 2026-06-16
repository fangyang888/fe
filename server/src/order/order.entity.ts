import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

/** 订单状态 */
export type OrderStatus =
  | 'unpaid' // 待付款
  | 'unshipped' // 待发货（已付款）
  | 'shipping' // 待收货（已发货）
  | 'unreviewed' // 待评价（已收货）
  | 'completed' // 已完成
  | 'after_sale' // 售后中
  | 'closed'; // 已关闭/取消

@Entity('order')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  /** 订单号，对用户展示 */
  @Index({ unique: true })
  @Column()
  orderNo: string;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', default: 'unpaid' })
  status: OrderStatus;

  /** 订单总额（元） */
  @Column({ type: 'int' })
  totalAmount: number;

  /** 收货地址快照（下单时拷贝，避免地址被改/删影响历史订单） */
  @Column({ type: 'text', nullable: true })
  addressSnapshot?: string;

  @Column({ nullable: true })
  remark?: string;

  @Column({ type: 'datetime', nullable: true })
  paidAt?: Date;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

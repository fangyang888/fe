import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';

/**
 * 订单明细：下单时对商品做快照（名称/价格/图片），
 * 之后商品改价或下架都不影响历史订单。
 */
@Entity('order_item')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  orderId: number;

  @Column({ type: 'int' })
  productId: number;

  @Column()
  name: string;

  /** 下单时单价（元） */
  @Column({ type: 'int' })
  price: number;

  @Column({ nullable: true })
  image?: string;

  @Column({ type: 'int' })
  quantity: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
}

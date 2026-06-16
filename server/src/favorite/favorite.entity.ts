import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

/** 用户商品收藏 */
@Entity('favorite')
@Unique('uq_user_favorite', ['userId', 'productId'])
export class Favorite {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  productId: number;

  @CreateDateColumn()
  created_at: Date;
}

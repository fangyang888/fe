import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** 首页轮播图 */
@Entity('banner')
export class Banner {
  @PrimaryGeneratedColumn()
  id: number;

  /** 轮播图 URL */
  @Column()
  image: string;

  @Column({ nullable: true })
  title?: string;

  /** 点击跳转的小程序路径或外链 */
  @Column({ nullable: true })
  link?: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 1显示 0隐藏 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;
}

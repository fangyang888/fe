import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('history')
export class History {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  n1: number;

  @Column({ type: 'int' })
  n2: number;

  @Column({ type: 'int' })
  n3: number;

  @Column({ type: 'int' })
  n4: number;

  @Column({ type: 'int' })
  n5: number;

  @Column({ type: 'int' })
  n6: number;

  @Column({ type: 'int' })
  n7: number;

  @Column({ type: 'int', nullable: true })
  year?: number;

  @Column({ type: 'int', nullable: true })
  No: number;

  @CreateDateColumn()
  created_at: Date;
}

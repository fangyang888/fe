import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  /** 显示中的分类，按 sort 升序 */
  findAll() {
    return this.repo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }

  /** 后台：全量（含隐藏） */
  findAllAdmin() {
    return this.repo.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  create(data: Partial<Category>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Category>) {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }
}

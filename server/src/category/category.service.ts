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
}

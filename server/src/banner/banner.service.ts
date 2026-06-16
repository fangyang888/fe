import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Banner } from './banner.entity';

@Injectable()
export class BannerService {
  constructor(
    @InjectRepository(Banner)
    private readonly repo: Repository<Banner>,
  ) {}

  /** 显示中的轮播，按 sort 升序 */
  findAll() {
    return this.repo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }
}

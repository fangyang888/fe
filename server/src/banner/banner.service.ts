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

  /** 后台：全量（含隐藏） */
  findAllAdmin() {
    return this.repo.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  create(data: Partial<Banner>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Banner>) {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }
}

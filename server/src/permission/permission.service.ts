import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permission.entity';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
  ) {}

  findAll() {
    return this.repo.find({ order: { group: 'ASC', id: 'ASC' } });
  }

  create(data: { code: string; name: string; group?: string }) {
    return this.repo.save(this.repo.create(data));
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }
}

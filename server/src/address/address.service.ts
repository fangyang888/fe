import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './address.entity';

export interface AddressDto {
  name: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
  isDefault?: boolean;
}

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly repo: Repository<Address>,
  ) {}

  /** 默认地址排最前 */
  findAll(userId: number) {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', updated_at: 'DESC' },
    });
  }

  async findOne(userId: number, id: number) {
    const addr = await this.repo.findOne({ where: { id, userId } });
    if (!addr) throw new NotFoundException('地址不存在');
    return addr;
  }

  async create(userId: number, dto: AddressDto) {
    if (dto.isDefault) await this.clearDefault(userId);
    const addr = this.repo.create({
      ...dto,
      userId,
      isDefault: dto.isDefault ? 1 : 0,
    });
    return this.repo.save(addr);
  }

  async update(userId: number, id: number, dto: Partial<AddressDto>) {
    const addr = await this.findOne(userId, id);
    if (dto.isDefault) await this.clearDefault(userId);
    Object.assign(addr, dto, {
      isDefault:
        dto.isDefault === undefined ? addr.isDefault : dto.isDefault ? 1 : 0,
    });
    return this.repo.save(addr);
  }

  async remove(userId: number, id: number) {
    await this.repo.delete({ id, userId });
    return { ok: true };
  }

  async setDefault(userId: number, id: number) {
    await this.findOne(userId, id);
    await this.clearDefault(userId);
    await this.repo.update({ id, userId }, { isDefault: 1 });
    return { ok: true };
  }

  /** 取默认地址（下单用） */
  getDefault(userId: number) {
    return this.repo.findOne({ where: { userId, isDefault: 1 } });
  }

  private clearDefault(userId: number) {
    return this.repo.update({ userId, isDefault: 1 }, { isDefault: 0 });
  }
}

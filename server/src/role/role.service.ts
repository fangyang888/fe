import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './role.entity';
import { Permission } from '../permission/permission.entity';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
  ) {}

  findAll() {
    return this.roleRepo.find({ order: { id: 'ASC' } });
  }

  async findById(id: number): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  async create(data: { code: string; name: string; remark?: string }) {
    const exists = await this.roleRepo.findOne({ where: { code: data.code } });
    if (exists) throw new BadRequestException('角色编码已存在');
    const role = this.roleRepo.create({ ...data, permissions: [] });
    return this.roleRepo.save(role);
  }

  async update(id: number, data: { name?: string; remark?: string }) {
    const role = await this.findById(id);
    Object.assign(role, data);
    return this.roleRepo.save(role);
  }

  async remove(id: number) {
    const role = await this.findById(id);
    if (role.is_system) throw new BadRequestException('内置角色不可删除');
    await this.roleRepo.remove(role);
    return { ok: true };
  }

  /** 给角色分配权限（整体覆盖） */
  async assignPermissions(roleId: number, permissionIds: number[]) {
    const role = await this.findById(roleId);
    role.permissions = permissionIds.length
      ? await this.permRepo.find({ where: { id: In(permissionIds) } })
      : [];
    return this.roleRepo.save(role);
  }
}

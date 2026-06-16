import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './user.entity';
import { Role } from '../role/role.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  /** 登录用：按 openid 查，不存在则创建（默认无角色 / 普通用户） */
  async findOrCreateByOpenid(openid: string, unionid?: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { openid } });
    if (!user) {
      user = this.userRepo.create({ openid, unionid, roles: [] });
      user = await this.userRepo.save(user);
      // 重新查一次以带出 eager 的 roles 关系
      user = await this.findById(user.id);
    }
    return user;
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  /** 分页列表（后台用） */
  async findAll(page = 1, pageSize = 20) {
    const [list, total] = await this.userRepo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async update(id: number, data: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, data);
    return this.userRepo.save(user);
  }

  /** 给用户分配角色（整体覆盖） */
  async assignRoles(userId: number, roleIds: number[]): Promise<User> {
    const user = await this.findById(userId);
    const roles = roleIds.length
      ? await this.roleRepo.find({ where: { id: In(roleIds) } })
      : [];
    user.roles = roles;
    return this.userRepo.save(user);
  }

  /** 启用 / 禁用 */
  async setStatus(id: number, status: number): Promise<User> {
    return this.update(id, { status });
  }
}

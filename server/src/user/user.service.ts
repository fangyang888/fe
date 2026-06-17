import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './user.entity';
import { Role } from '../role/role.entity';
import { hashPassword } from '../auth/password.util';

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

  /** 按后台账号查询，显式带出 password（默认 select:false）+ 角色 + 权限 */
  findByUsername(username: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.username = :username', { username })
      .getOne();
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

  /** 后台创建账号（账号密码登录用）。isAdmin=true 则挂 admin 角色 */
  async createAccount(data: {
    username: string;
    password: string;
    nickname?: string;
    isAdmin?: boolean;
  }): Promise<User> {
    const username = data.username?.trim();
    if (!username || !data.password) {
      throw new BadRequestException('账号和密码不能为空');
    }
    const exists = await this.userRepo.findOne({ where: { username } });
    if (exists) throw new BadRequestException('账号已存在');

    let roles: Role[] = [];
    if (data.isAdmin) {
      const adminRole = await this.roleRepo.findOne({
        where: { code: 'admin' },
      });
      if (adminRole) roles = [adminRole];
    }

    const user = this.userRepo.create({
      openid: `admin_${username}`,
      username,
      nickname: data.nickname || username,
      password: hashPassword(data.password),
      status: 1,
      roles,
    });
    const saved = await this.userRepo.save(user);
    return this.findById(saved.id);
  }
}

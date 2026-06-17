import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { CurrentUser, RequirePermissions } from '../auth/decorators';

class UpdateProfileDto {
  nickname?: string;
  avatar?: string;
  gender?: number;
}
class AssignRolesDto {
  roleIds: number[];
}
class SetStatusDto {
  status: number;
}
class CreateAccountDto {
  username: string;
  password: string;
  nickname?: string;
  isAdmin?: boolean;
}

@Controller('api/user')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  /** GET /api/user/profile — 当前登录用户信息 */
  @Get('profile')
  profile(@CurrentUser('userId') userId: number) {
    return this.users.findById(userId);
  }

  /** PUT /api/user/profile — 更新自己的昵称/头像/性别 */
  @Put('profile')
  updateProfile(
    @CurrentUser('userId') userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.update(userId, dto);
  }

  // ---------- 以下为后台管理接口，需对应权限 ----------

  /** POST /api/user — 创建后台账号（仅超管：admin 角色在守卫里放行） */
  @Post()
  @RequirePermissions('user:create')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.users.createAccount(dto);
  }

  /** GET /api/user — 用户列表 */
  @Get()
  @RequirePermissions('user:list')
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.users.findAll(Number(page), Number(pageSize));
  }

  /** GET /api/user/:id — 用户详情 */
  @Get(':id')
  @RequirePermissions('user:list')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findById(id);
  }

  /** POST /api/user/:id/roles — 给用户分配角色 */
  @Post(':id/roles')
  @RequirePermissions('user:assign-role')
  assignRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
  ) {
    return this.users.assignRoles(id, dto.roleIds);
  }

  /** PUT /api/user/:id/status — 启用/禁用 */
  @Put(':id/status')
  @RequirePermissions('user:update')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStatusDto,
  ) {
    return this.users.setStatus(id, dto.status);
  }
}

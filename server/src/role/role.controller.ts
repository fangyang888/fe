import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';

class CreateRoleDto {
  code: string;
  name: string;
  remark?: string;
}
class UpdateRoleDto {
  name?: string;
  remark?: string;
}
class AssignPermsDto {
  permissionIds: number[];
}

@Controller('api/role')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('role:list')
  findAll() {
    return this.roles.findAll();
  }

  @Get(':id')
  @RequirePermissions('role:list')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roles.findById(id);
  }

  @Post()
  @RequirePermissions('role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Put(':id')
  @RequirePermissions('role:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roles.remove(id);
  }

  /** PUT /api/role/:id/permissions — 给角色分配权限 */
  @Put(':id/permissions')
  @RequirePermissions('role:assign-perm')
  assignPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPermsDto,
  ) {
    return this.roles.assignPermissions(id, dto.permissionIds);
  }
}

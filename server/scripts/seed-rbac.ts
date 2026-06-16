/**
 * RBAC 种子脚本：初始化权限点、内置 admin 角色，并把指定 openid 设为管理员。
 *
 * 使用方式:
 *   npx ts-node scripts/seed-rbac.ts                  # 仅初始化权限和 admin 角色
 *   npx ts-node scripts/seed-rbac.ts <你的openid>      # 额外把该用户提升为 admin
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { createConnection, In } from 'typeorm';
import { User } from '../src/user/user.entity';
import { Role } from '../src/role/role.entity';
import { Permission } from '../src/permission/permission.entity';

dotenv.config({ path: join(__dirname, '..', '.env') });

// 权限点清单：code 与各 controller 上 @RequirePermissions 一一对应
const PERMISSIONS: { code: string; name: string; group: string }[] = [
  { code: 'user:list', name: '查看用户', group: 'user' },
  { code: 'user:update', name: '编辑用户', group: 'user' },
  { code: 'user:assign-role', name: '分配角色', group: 'user' },
  { code: 'role:list', name: '查看角色', group: 'role' },
  { code: 'role:create', name: '新建角色', group: 'role' },
  { code: 'role:update', name: '编辑角色', group: 'role' },
  { code: 'role:delete', name: '删除角色', group: 'role' },
  { code: 'role:assign-perm', name: '分配权限', group: 'role' },
  { code: 'permission:list', name: '查看权限', group: 'permission' },
  { code: 'permission:create', name: '新建权限', group: 'permission' },
  { code: 'permission:delete', name: '删除权限', group: 'permission' },
];

async function seed() {
  const connection = await createConnection({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
    entities: [User, Role, Permission],
    synchronize: true, // 自动建表
  });
  console.log('✅ 数据库连接成功，表已同步');

  const permRepo = connection.getRepository(Permission);
  const roleRepo = connection.getRepository(Role);
  const userRepo = connection.getRepository(User);

  // 1) upsert 权限点
  for (const p of PERMISSIONS) {
    const exists = await permRepo.findOne({ where: { code: p.code } });
    if (!exists) await permRepo.save(permRepo.create(p));
  }
  const allPerms = await permRepo.find();
  console.log(`✅ 权限点就绪：${allPerms.length} 个`);

  // 2) 内置 admin 角色（拥有全部权限；守卫里 admin 角色本就全放行，这里仅保证数据完整）
  let admin = await roleRepo.findOne({ where: { code: 'admin' } });
  if (!admin) {
    admin = roleRepo.create({
      code: 'admin',
      name: '超级管理员',
      is_system: 1,
      permissions: [],
    });
  }
  admin.permissions = allPerms;
  admin = await roleRepo.save(admin);
  console.log('✅ admin 角色就绪');

  // 3) 可选：把指定 openid 的用户设为 admin
  const openid = process.argv[2];
  if (openid) {
    let user = await userRepo.findOne({ where: { openid } });
    if (!user) {
      user = userRepo.create({ openid, roles: [] });
    }
    user.roles = [admin];
    await userRepo.save(user);
    console.log(`✅ 用户 ${openid} 已设为管理员`);
  } else {
    console.log('ℹ️  未传 openid，跳过管理员指派。先登录拿到 openid 再跑一次即可。');
  }

  await connection.close();
  console.log('🔒 完成');
}

seed().catch((err) => {
  console.error('❌ seed 失败:', err.message);
  process.exit(1);
});

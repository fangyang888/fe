/**
 * 创建/更新后台管理员账号（账号密码登录用），并挂上 admin 角色。
 *
 * 使用方式:
 *   npx ts-node scripts/seed-admin.ts                 # 默认 admin / admin123
 *   npx ts-node scripts/seed-admin.ts myname mypass   # 自定义账号密码
 *
 * 前置：admin 角色需已存在（先跑 seed-rbac.ts 或 init-tables.sql）。
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { createConnection } from 'typeorm';
import { User } from '../src/user/user.entity';
import { Role } from '../src/role/role.entity';
import { Permission } from '../src/permission/permission.entity';
import { hashPassword } from '../src/auth/password.util';

dotenv.config({ path: join(__dirname, '..', '.env') });

async function seed() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';

  const connection = await createConnection({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
    entities: [User, Role, Permission],
    synchronize: true,
  });
  console.log('✅ 数据库连接成功');

  const userRepo = connection.getRepository(User);
  const roleRepo = connection.getRepository(Role);

  const adminRole = await roleRepo.findOne({ where: { code: 'admin' } });
  if (!adminRole) {
    console.error('❌ 未找到 admin 角色，请先跑 seed-rbac.ts 或 init-tables.sql');
    await connection.close();
    process.exit(1);
  }

  let user = await userRepo.findOne({ where: { username } });
  if (!user) {
    // 后台账号也需要 openid（唯一），用 username 派生一个占位 openid
    user = userRepo.create({
      openid: `admin_${username}`,
      username,
      nickname: username,
      status: 1,
      roles: [adminRole],
    });
  } else {
    user.roles = [adminRole];
  }
  user.password = hashPassword(password);
  await userRepo.save(user);

  console.log(`✅ 管理员账号就绪：用户名=${username} 密码=${password}`);
  await connection.close();
}

seed().catch((err) => {
  console.error('❌ seed 失败:', err.message);
  process.exit(1);
});

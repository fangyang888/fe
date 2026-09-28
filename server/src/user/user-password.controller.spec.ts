import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request = require('supertest');
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';
import { Role } from '../role/role.entity';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { WechatService } from '../auth/wechat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { TokenService } from '../auth/token.service';
import { hashPassword } from '../auth/password.util';

describe('User password management', () => {
  let app: INestApplication;
  let token: TokenService;
  let users: Map<number, Partial<User>>;
  let admin: string;
  const update = jest.fn(async (id: number, data: Partial<User>) => {
    const user = users.get(id);
    if (!user) return { affected: 0 };
    Object.assign(user, data);
    return { affected: 1 };
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserController, AuthController],
      providers: [UserService, AuthService, JwtAuthGuard, PermissionGuard, TokenService,
        { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'password-test-only' }) },
        { provide: WechatService, useValue: {} },
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {
          findOne: jest.fn(async ({ where }: { where: { id: number } }) => {
            const user = users.get(where.id);
            if (!user) return null;
            const { password, ...profile } = user;
            return profile;
          }),
          update,
          createQueryBuilder: () => {
            let username: string;
            const builder = {
              addSelect: () => builder,
              leftJoinAndSelect: () => builder,
              where: (_query: string, params: { username: string }) => { username = params.username; return builder; },
              getOne: async () => [...users.values()].find((user) => user.username === username),
            };
            return builder;
          },
        } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    token = module.get(TokenService);
    admin = token.sign({ userId: 1, roles: ['admin'], permissions: [] });
  });

  beforeEach(() => {
    users = new Map([
      [1, { id: 1, username: 'admin-test', openid: 'admin-test', status: 1, roles: [{ code: 'admin' } as Role] }],
      [2, { id: 2, username: 'staff-test', openid: 'staff-test', status: 1, roles: [], password: hashPassword('Old-test-123') }],
      [3, { id: 3, openid: 'wx-test', status: 1, roles: [] }],
    ]);
    update.mockClear();
  });

  afterAll(async () => { await app?.close(); });
  const change = (body: object, id = '2', bearer?: string) => request(app.getHttpServer())
    .put(`/api/user/${id}/password`).auth(bearer ?? admin, { type: 'bearer' }).send(body);

  it('rejects anonymous callers and non-admins, including holders of the permission alone', async () => {
    await request(app.getHttpServer()).put('/api/user/2/password').send({ password: 'New-test-123' }).expect(401);
    for (const permissions of [[], ['user:reset-password']]) {
      const member = token.sign({ userId: 2, roles: [], permissions });
      await change({ password: 'New-test-123' }, '2', member).expect(403);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'demoted'])('rejects a %s administrator with an old token', async (state) => {
    Object.assign(users.get(1)!, state === 'disabled' ? { status: 0 } : { roles: [] });
    await change({ password: 'New-test-123' }).expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123456, {}, ['abcdef'], '', 'short', '      ', 'x'.repeat(65)])(
    'rejects invalid password input %# without changing the account', async (password) => {
      await change({ password }).expect(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('rejects missing users, invalid IDs and accounts that only use WeChat login', async () => {
    await change({ password: 'New-test-123' }, '999').expect(404);
    await change({ password: 'New-test-123' }, 'invalid').expect(400);
    await change({ password: 'New-test-123' }, '3').expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('stores a hash, preserves profile/roles, accepts the new login and rejects the old password', async () => {
    const before = { ...users.get(2)! };
    const response = await change({ password: 'New-test-123', username: 'injected', roles: ['admin'] }).expect(200);
    expect(response.body).toEqual({ success: true });
    expect(users.get(2)!.password).not.toBe('New-test-123');
    expect(users.get(2)).toEqual({ ...before, password: expect.any(String) });
    expect(Object.keys(update.mock.calls[0][1])).toEqual(['password']);
    await request(app.getHttpServer()).post('/api/auth/admin-login')
      .send({ username: 'staff-test', password: 'Old-test-123' }).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/admin-login')
      .send({ username: 'staff-test', password: 'New-test-123' }).expect(201);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.userInfo).not.toHaveProperty('password');
    const profile = await request(app.getHttpServer()).get('/api/user/2').auth(admin, { type: 'bearer' }).expect(200);
    expect(profile.body).not.toHaveProperty('password');
  });

  it('allows a super administrator to change their own password', async () => {
    await change({ password: 'Self-test-123' }, '1').expect(200);
    await request(app.getHttpServer()).post('/api/auth/admin-login')
      .send({ username: 'admin-test', password: 'Self-test-123' }).expect(201);
  });
});

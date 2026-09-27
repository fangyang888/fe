import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp = require('sharp');
import request = require('supertest');
import { UploadController } from './upload.controller';
import { MAX_IMAGE_BYTES, UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { TokenService } from '../auth/token.service';

describe('Image upload HTTP flow', () => {
  let app: INestApplication;
  let directory: string;
  let token: TokenService;
  let admin: string;
  let jpg: Buffer;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fzmall-upload-test-'));
    const module = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [UploadService, JwtAuthGuard, PermissionGuard, TokenService, {
        provide: ConfigService,
        useValue: new ConfigService({ UPLOAD_DIR: directory, PUBLIC_BASE_URL: 'https://shop.example', JWT_SECRET: 'upload-test-only' }),
      }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    token = module.get(TokenService);
    admin = token.sign({ userId: 1, roles: ['admin'], permissions: [] });
    jpg = await sharp({ create: { width: 2200, height: 120, channels: 3, background: '#ece8df' } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('rejects anonymous and ordinary users before storing anything', async () => {
    await request(app.getHttpServer()).post('/api/admin/uploads/images').attach('file', jpg, 'photo.jpg').expect(401);
    const member = token.sign({ userId: 2, roles: ['member'], permissions: [] });
    await request(app.getHttpServer()).post('/api/admin/uploads/images').auth(member, { type: 'bearer' }).attach('file', jpg, 'photo.jpg').expect(403);
    expect(await readdir(directory)).toEqual([]);
  });

  it('uploads, normalizes and serves a public image with a server-generated name', async () => {
    const result = await request(app.getHttpServer()).post('/api/admin/uploads/images').auth(admin, { type: 'bearer' })
      .attach('file', jpg, { filename: 'untrusted.php', contentType: 'image/jpeg' }).expect(201);
    expect(result.body.url).toMatch(/^https:\/\/shop.example\/api\/media\/images\/[a-f0-9-]+\.jpg$/);
    const image = await request(app.getHttpServer()).get(new URL(result.body.url).pathname).expect(200).expect('Content-Type', /image\/jpeg/).expect('X-Content-Type-Options', 'nosniff');
    expect((await sharp(image.body).metadata()).width).toBe(2000);
    expect(image.headers['cache-control']).toContain('immutable');
  });

  it.each(['png', 'webp'] as const)('accepts actual %s images', async format => {
    const buffer = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ffffff00' } }).toFormat(format).toBuffer();
    const result = await request(app.getHttpServer()).post('/api/admin/uploads/images').auth(admin, { type: 'bearer' }).attach('file', buffer, `sample.${format}`).expect(201);
    await request(app.getHttpServer()).get(new URL(result.body.url).pathname).expect(200).expect('Content-Type', `image/${format}`);
  });

  it('rejects missing, spoofed, corrupt, oversized and multi-file uploads without persisting files', async () => {
    const before = await readdir(directory);
    const upload = () => request(app.getHttpServer()).post('/api/admin/uploads/images').auth(admin, { type: 'bearer' });
    await upload().expect(400);
    await upload().attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), { filename: 'fake.jpg', contentType: 'image/jpeg' }).expect(400);
    await upload().attach('file', jpg.subarray(0, 30), 'broken.jpg').expect(400);
    await upload().attach('file', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'large.jpg').expect(413);
    await upload().attach('file', jpg, 'one.jpg').attach('file', jpg, 'two.jpg').expect(400);
    expect(await readdir(directory)).toEqual(before);
  });

  it('does not expose arbitrary filesystem paths or missing files', async () => {
    await request(app.getHttpServer()).get('/api/media/images/package.json').expect(404);
    await request(app.getHttpServer()).get('/api/media/images/00000000-0000-0000-0000-000000000000.jpg').expect(404);
  });
});

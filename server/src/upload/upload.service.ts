import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import sharp = require('sharp');

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FORMATS = new Set(['jpeg', 'png', 'webp']);
const IMAGE_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {}

  get directory(): string {
    // 独立于 dist，发布代码不会删除已上传图片。
    return resolve(this.config.get<string>('UPLOAD_DIR') || join(process.cwd(), '..', 'uploads', 'images'));
  }

  async save(file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择图片');
    if (file.buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('图片不能超过 5 MB');

    let output: Buffer;
    let extension: string;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25_000_000, failOn: 'warning' });
      const metadata = await image.metadata();
      if (!metadata.format || !FORMATS.has(metadata.format) || (metadata.pages || 1) > 1) {
        throw new Error('Unsupported image');
      }
      extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
      // 实际解码后重新编码：不信任文件名/MIME，移除 EXIF，控制尺寸。
      output = await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .toFormat(metadata.format, { quality: 85 }).toBuffer();
    } catch {
      throw new BadRequestException('请选择有效的 JPG、PNG 或 WebP 静态图片（不超过 2500 万像素）');
    }

    const filename = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, filename), output, { flag: 'wx', mode: 0o644 });
    const base = this.config.get<string>('PUBLIC_BASE_URL', 'https://fzmall.xyz').replace(/\/$/, '');
    return { url: `${base}/api/media/images/${filename}`, filename, size: output.length };
  }

  async find(filename: string) {
    if (!IMAGE_NAME.test(filename)) throw new NotFoundException('图片不存在');
    const path = join(this.directory, filename);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('Not a file');
    } catch {
      throw new NotFoundException('图片不存在');
    }
    return path;
  }
}

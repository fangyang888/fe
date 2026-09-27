import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/decorators';
import { MAX_IMAGE_BYTES, UploadService } from './upload.service';

@Controller('api')
export class UploadController {
  constructor(private readonly service: UploadService) {}

  @Post('admin/uploads/images')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('media:upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
  }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.service.save(file);
  }

  @Get('media/images/:filename')
  async image(@Param('filename') filename: string, @Res() response: Response) {
    const path = await this.service.find(filename);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.sendFile(path, { maxAge: '30d', immutable: true });
  }
}

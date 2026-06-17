import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Banner } from './banner.entity';
import { BannerService } from './banner.service';
import { BannerController } from './banner.controller';
import { BannerAdminController } from './banner-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Banner])],
  controllers: [BannerController, BannerAdminController],
  providers: [BannerService],
  exports: [BannerService],
})
export class BannerModule {}

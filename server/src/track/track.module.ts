import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { TrackService } from './track.service';
import { TrackController } from './track.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Event])],
  controllers: [TrackController],
  providers: [TrackService],
  exports: [TrackService],
})
export class TrackModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoryHk } from './history-hk.entity';
import { HistoryHkService } from './history-hk.service';
import { HistoryHkController } from './history-hk.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HistoryHk])],
  controllers: [HistoryHkController],
  providers: [HistoryHkService],
  exports: [HistoryHkService],
})
export class HistoryHkModule {}

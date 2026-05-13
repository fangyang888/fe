import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { HistoryHkModule } from '../history-hk/history-hk.module';
import { PredictorController } from './predictor.controller';
import { PredictorService } from './predictor.service';

@Module({
  imports: [HistoryModule, HistoryHkModule],
  controllers: [PredictorController],
  providers: [PredictorService],
})
export class PredictorModule {}

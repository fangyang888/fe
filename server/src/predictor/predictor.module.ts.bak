import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { HistoryHkModule } from '../history-hk/history-hk.module';
import { PredictorController } from './predictor.controller';
import { PredictorService } from './predictor.service';
import { PredictorOptController } from './predictor-opt.controller';
import { PredictorOptService } from './predictor-opt.service';

@Module({
  imports: [HistoryModule, HistoryHkModule],
  controllers: [PredictorController, PredictorOptController],
  providers: [PredictorService, PredictorOptService],
})
export class PredictorModule {}

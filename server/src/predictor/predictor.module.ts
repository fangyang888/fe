import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { PredictorController } from './predictor.controller';
import { PredictorService } from './predictor.service';

@Module({
  imports: [HistoryModule],
  controllers: [PredictorController],
  providers: [PredictorService],
})
export class PredictorModule {}

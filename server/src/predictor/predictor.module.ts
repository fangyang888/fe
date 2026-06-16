import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { HistoryHkModule } from '../history-hk/history-hk.module';
import { PredictorController } from './predictor.controller';
import { PredictorService } from './predictor.service';
import { PredictorOptController } from './predictor-opt.controller';
import { PredictorOptService } from './predictor-opt.service';
import { PredictorKill2Controller } from './predictor-kill2.controller';
import { PredictorKill2Service } from './predictor-kill2.service';
import { FivePeriodKillController } from './five-period-kill.controller';
import { FivePeriodKillService } from './five-period-kill.service';
import { FixedHybridKillController } from './fixed-hybrid-kill.controller';
import { FixedHybridKillService } from './fixed-hybrid-kill.service';
import { KillTenController } from './kill-ten.controller';
import { KillTenService } from './kill-ten.service';
import { KillOneController } from './kill-one.controller';
import { KillOneService } from './kill-one.service';
import { POneKillController } from './p-one-kill.controller';
import { POneKillService } from './p-one-kill.service';

@Module({
  imports: [HistoryModule, HistoryHkModule],
  controllers: [
    PredictorController,
    PredictorOptController,
    PredictorKill2Controller,
    FivePeriodKillController,
    FixedHybridKillController,
    KillTenController,
    KillOneController,
    POneKillController,
  ],
  providers: [
    PredictorService,
    PredictorOptService,
    PredictorKill2Service,
    FivePeriodKillService,
    FixedHybridKillService,
    KillTenService,
    KillOneService,
    POneKillService,
  ],
})
export class PredictorModule {}

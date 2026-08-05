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
import { KillComboBacktestController } from './kill-combo-backtest.controller';
import { KillComboBacktestService } from './kill-combo-backtest.service';
import { TailTenKillController } from './tail-ten-kill.controller';
import { TailTenKillService } from './tail-ten-kill.service';
import { MultiDimKillController } from './multi-dim-kill.controller';
import { MultiDimKillService } from './multi-dim-kill.service';
import { ExperimentalKill98Controller } from './experimental-kill98.controller';
import { ExperimentalKill98Service } from './experimental-kill98.service';
import { ExperimentalKill99Controller } from './experimental-kill99.controller';
import { ExperimentalKill99Service } from './experimental-kill99.service';
import { ExperimentalGuardedKillController } from './experimental-guarded-kill.controller';
import { ExperimentalGuardedKillService } from './experimental-guarded-kill.service';
import { GapScoreKillController } from './gap-score-kill.controller';
import { GapScoreKillService } from './gap-score-kill.service';
import { KillComboSevenController } from './kill-combo-seven.controller';
import { KillComboSevenService } from './kill-combo-seven.service';
import { DynamicSevenKillController } from './dynamic-seven-kill.controller';
import { DynamicSevenKillService } from './dynamic-seven-kill.service';
import { StateRiskKillController } from './state-risk-kill.controller';
import { StateRiskKillService } from './state-risk-kill.service';
import { TenAnchorShiftKillController } from './ten-anchor-shift-kill.controller';
import { TenAnchorShiftKillService } from './ten-anchor-shift-kill.service';
import { PreviousSevenQuadKillController } from './previous-seven-quad-kill.controller';
import { PreviousSevenQuadKillService } from './previous-seven-quad-kill.service';
import { QuadraticAnchor53KillController } from './quadratic-anchor-53-kill.controller';
import { QuadraticAnchor53KillService } from './quadratic-anchor-53-kill.service';
import { AnchorPhase14KillController } from './anchor-phase-14-kill.controller';
import { AnchorPhase14KillService } from './anchor-phase-14-kill.service';
import { TailGatedDualKillController } from './tail-gated-dual-kill.controller';
import { TailGatedDualKillService } from './tail-gated-dual-kill.service';
import { QuadraticAnchor49SevenKillController } from './quadratic-anchor-49-seven-kill.controller';
import { QuadraticAnchor49SevenKillService } from './quadratic-anchor-49-seven-kill.service';
import { QuadraticAnchor17FirstKillController } from './quadratic-anchor-17-first-kill.controller';
import { QuadraticAnchor17FirstKillService } from './quadratic-anchor-17-first-kill.service';
import { DualTimeAnchorKillController } from './dual-time-anchor-kill.controller';
import { DualTimeAnchorKillService } from './dual-time-anchor-kill.service';
import { LinearAnchor63FirstKillController } from './linear-anchor-63-first-kill.controller';
import { LinearAnchor63FirstKillService } from './linear-anchor-63-first-kill.service';
import { TieredKillComboController } from './tiered-kill-combo.controller';
import { TieredKillComboService } from './tiered-kill-combo.service';
import { RiskControlledFiveController } from './risk-controlled-five.controller';
import { RiskControlledFiveService } from './risk-controlled-five.service';

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
    KillComboBacktestController,
    TailTenKillController,
    MultiDimKillController,
    ExperimentalKill98Controller,
    ExperimentalKill99Controller,
    ExperimentalGuardedKillController,
    GapScoreKillController,
    KillComboSevenController,
    DynamicSevenKillController,
    StateRiskKillController,
    TenAnchorShiftKillController,
    PreviousSevenQuadKillController,
    QuadraticAnchor53KillController,
    AnchorPhase14KillController,
    TailGatedDualKillController,
    QuadraticAnchor49SevenKillController,
    QuadraticAnchor17FirstKillController,
    DualTimeAnchorKillController,
    LinearAnchor63FirstKillController,
    TieredKillComboController,
    RiskControlledFiveController,
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
    KillComboBacktestService,
    TailTenKillService,
    MultiDimKillService,
    ExperimentalKill98Service,
    ExperimentalKill99Service,
    ExperimentalGuardedKillService,
    GapScoreKillService,
    KillComboSevenService,
    DynamicSevenKillService,
    StateRiskKillService,
    TenAnchorShiftKillService,
    PreviousSevenQuadKillService,
    QuadraticAnchor53KillService,
    AnchorPhase14KillService,
    TailGatedDualKillService,
    QuadraticAnchor49SevenKillService,
    QuadraticAnchor17FirstKillService,
    DualTimeAnchorKillService,
    LinearAnchor63FirstKillService,
    TieredKillComboService,
    RiskControlledFiveService,
  ],
})
export class PredictorModule {}

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../server/src/app.module';
import { PredictorService } from '../server/src/predictor/predictor.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const predictorService = app.get(PredictorService);
  
  const res = await predictorService.getKillPredictions();
  console.log("Overall Accuracy:", res.backtestStats?.overallAccuracy);
  await app.close();
}
bootstrap();

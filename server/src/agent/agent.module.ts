import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ProductModule } from 'src/product/product.module';
import { CategoryModule } from 'src/category/category.module';
import { AgentIntentService } from './agent.intent.service';
@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [AgentController],
  providers: [AgentService, AgentIntentService],
  exports: [AgentService, AgentIntentService],
})
export class AgentModule {}

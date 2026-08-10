import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ProductModule } from 'src/product/product.module';
import { CategoryModule } from 'src/category/category.module';
import { AgentIntentService } from './agent.intent.service';
import { AgentModelFactory } from './agent-model.factory';
import { ProductCustomerService } from './product-customer.service';

@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [AgentController],
  providers: [
    AgentModelFactory,
    AgentIntentService,
    ProductCustomerService,
    AgentService,
  ],
  // 其他模块目前不需要直接操作内部组件，只暴露统一入口 AgentService。
  exports: [AgentService],
})
export class AgentModule {}

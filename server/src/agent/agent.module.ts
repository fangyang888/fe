import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ProductModule } from 'src/product/product.module';
import { CategoryModule } from 'src/category/category.module';
import { AgentIntentService } from './agent.intent.service';
import { AgentModelFactory } from './agent-model.factory';
import { ProductCustomerService } from './product-customer.service';
import { AgentConversationService } from './conversation/agent.conversation.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConversationRecord } from './persistence/agent-conversation.entity';
import { AgentMessageRecord } from './persistence/agent-message.entity';
import { AgentHistoryController } from './persistence/agent-history.controller';
import { AgentHistoryService } from './persistence/agent-history.service';
import { AgentChatApplicationService } from './persistence/agent-chat-application.service';
import { AgentCheckpointerService } from './persistence/agent-checkpointer.service';

@Module({
  imports: [
    ProductModule,
    CategoryModule,
    TypeOrmModule.forFeature([AgentConversationRecord, AgentMessageRecord]),
  ],
  controllers: [AgentController, AgentHistoryController],
  providers: [
    AgentModelFactory,
    AgentIntentService,
    ProductCustomerService,
    AgentService,
    AgentConversationService,
    AgentHistoryService,
    AgentChatApplicationService,
    AgentCheckpointerService,
  ],
  // 其他模块目前不需要直接操作内部组件，只暴露统一入口 AgentService。
  exports: [AgentService],
})
export class AgentModule {}

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DatabaseModule } from './shared/database/database.module.js';
import { HealthController } from './shared/health.controller.js';
import { MessagingModule } from './shared/messaging/messaging.module.js';
import { WorkflowRuntimeModule } from './shared/workflow/workflow-runtime.module.js';

@Module({
  imports: [CqrsModule.forRoot(), DatabaseModule, MessagingModule, WorkflowRuntimeModule],
  controllers: [HealthController],
})
export class AppModule {}

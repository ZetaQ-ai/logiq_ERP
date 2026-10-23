import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database/database.module.js';
import { HealthController } from './shared/health.controller.js';
import { MessagingModule } from './shared/messaging/messaging.module.js';

@Module({ imports: [DatabaseModule, MessagingModule], controllers: [HealthController] })
export class AppModule {}

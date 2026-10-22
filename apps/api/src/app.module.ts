import { Module } from '@nestjs/common';
import { DatabaseModule } from './shared/database/database.module.js';
import { HealthController } from './shared/health.controller.js';

@Module({ imports: [DatabaseModule], controllers: [HealthController] })
export class AppModule {}

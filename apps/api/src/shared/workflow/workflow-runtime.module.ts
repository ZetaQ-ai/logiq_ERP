import { Global, Module } from '@nestjs/common';
import { WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';
import { PostgresWorkflowStore, fromDrizzle } from '@nestjs/workflows/postgres';
import { DB } from '../database/database.module.js';
import type { Db } from '../database/database.module.js';
import { CommandSender } from './command-sender.js';
import { WorkflowResults } from './workflow-results.js';

/**
 * @nestjs/workflows on our Postgres, in its own schema nest_workflows. Its tables come from a drizzle
 * migration (npm run db:migrate); startup fails if that migration has not been applied.
 */
@Global()
@Module({
  imports: [WorkflowsModule.forRoot()],
  providers: [
    {
      provide: PostgresWorkflowStore,
      inject: [DB, WorkflowStorage],
      useFactory: (db: Db, storage: WorkflowStorage) =>
        new PostgresWorkflowStore({ executor: fromDrizzle(db), migrate: false }, storage),
    },
    CommandSender,
    WorkflowResults,
  ],
  exports: [CommandSender, WorkflowResults],
})
export class WorkflowRuntimeModule {}

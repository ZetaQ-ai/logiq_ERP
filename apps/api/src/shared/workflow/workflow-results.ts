import { Injectable } from '@nestjs/common';
import { WorkflowClient } from '@nestjs/workflows';
import type { CommandCompleted, CommandRejection } from '../messaging/command-results.js';
import type { Envelope } from '../messaging/envelope.js';
import { MessageConsumer } from '../messaging/message-consumer.js';
import { COMMAND_RESULT } from './send-command.js';
import type { CommandOutcome } from './send-command.js';

/**
 * Turns command results into workflow signals (coding standard 7.2). Each workflow's results listener,
 * on queue workflows.<workflow>-results, calls forward for event.*.command.completed and .rejected.
 */
@Injectable()
export class WorkflowResults {
  constructor(
    private readonly consumer: MessageConsumer,
    private readonly client: WorkflowClient,
  ) {}

  forward(ctx: unknown, env: Envelope<CommandCompleted | CommandRejection>, queue: string, workflow: string) {
    return this.consumer.event(ctx, env, queue, async (tx) => {
      if (!env.headers.correlationId.startsWith(`${workflow}-`)) return; // answers another workflow's command
      const outcome: CommandOutcome = env.topic.endsWith('.command.rejected')
        ? { status: 'rejected', reason: (env.payload as CommandRejection).reason }
        : { status: 'completed', result: (env.payload as CommandCompleted).result };
      await this.client.signal(COMMAND_RESULT, outcome, { key: env.payload.commandId, id: env.id, transaction: tx });
    });
  }
}

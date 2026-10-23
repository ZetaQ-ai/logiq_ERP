import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../database/database.module.js';
import type { Db, Tx } from '../database/database.module.js';
import { CommandRejected } from './command-results.js';
import type { CommandCompleted, CommandRejection } from './command-results.js';
import { metaFrom } from './envelope.js';
import type { Envelope } from './envelope.js';
import { MessageBus } from './message-bus.js';
import type { MessageContext } from './rabbit-transport.js';
import { processed } from './schema.js';
import type { StoredResult } from './schema.js';

/** The single call a listener body makes (coding standard 6.2). */
@Injectable()
export class MessageConsumer {
  private readonly logger = new Logger(MessageConsumer.name);

  constructor(
    private readonly bus: MessageBus,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Runs the work and the duplicate check in one transaction; messages it adds are sent after commit. */
  async event<T>(ctx: unknown, env: Envelope<T>, queue: string, work: (tx: Tx) => Promise<unknown>): Promise<void> {
    checkQueue(ctx, queue);
    await this.bus.transaction(async (tx) => {
      if (await this.claim(tx, queue, env.id)) await work(tx);
      else this.logger.debug(`${queue} skipped duplicate ${env.id}`);
    });
  }

  /**
   * Like event, then publishes the command's result (coding standard 6.3): command.completed with what
   * the work returned, or command.rejected when it throws CommandRejected. Any other error propagates
   * and the message goes to the dead-letter queue. A repeated command id gets the stored result again.
   */
  async command<T>(ctx: unknown, env: Envelope<T>, queue: string, work: (tx: Tx) => Promise<unknown>): Promise<void> {
    checkQueue(ctx, queue);
    const module = queue.slice(0, -'.commands'.length);
    try {
      await this.bus.transaction(async (tx) => {
        if (!(await this.claim(tx, queue, env.id))) return this.replay(tx, queue, env);
        const completed: CommandCompleted = { command: env.topic, commandId: env.id, result: (await work(tx)) ?? null };
        await this.recordResult(tx, queue, env, { topic: `event.${module}.command.completed`, payload: completed });
      });
    } catch (error) {
      if (!(error instanceof CommandRejected)) throw error;
      // The work and its messages were rolled back; record the rejection on its own.
      await this.bus.transaction(async (tx) => {
        if (!(await this.claim(tx, queue, env.id))) return this.replay(tx, queue, env);
        const rejected: CommandRejection = { command: env.topic, commandId: env.id, reason: error.reason };
        await this.recordResult(tx, queue, env, { topic: `event.${module}.command.rejected`, payload: rejected });
      });
    }
  }

  /**
   * For work that calls an external system. There is no surrounding transaction and the work may run
   * twice: make the external call first, then record and publish inside bus.transaction.
   */
  async sideEffect<T>(ctx: unknown, env: Envelope<T>, queue: string, work: () => Promise<unknown>): Promise<void> {
    checkQueue(ctx, queue);
    const [seen] = await this.db
      .select({ messageId: processed.messageId })
      .from(processed)
      .where(row(queue, env.id));
    if (seen) return this.logger.debug(`${queue} skipped duplicate ${env.id}`);
    await work();
    await this.db.insert(processed).values({ queue, messageId: env.id }).onConflictDoNothing();
  }

  /** True if this queue has not handled the message yet. Commits or rolls back with the work. */
  private async claim(tx: Tx, queue: string, messageId: string): Promise<boolean> {
    const rows = await tx
      .insert(processed)
      .values({ queue, messageId })
      .onConflictDoNothing()
      .returning({ messageId: processed.messageId });
    return rows.length > 0;
  }

  private async recordResult(tx: Tx, queue: string, env: Envelope<unknown>, result: StoredResult) {
    await tx.update(processed).set({ result }).where(row(queue, env.id));
    this.addResult(tx, env, result);
  }

  private async replay(tx: Tx, queue: string, env: Envelope<unknown>) {
    const [seen] = await tx.select({ result: processed.result }).from(processed).where(row(queue, env.id));
    if (seen?.result) this.addResult(tx, env, seen.result);
    this.logger.debug(`${queue} replayed the result of duplicate ${env.id}`);
  }

  /** Stable id, so a listener that already has this result skips the repeat. */
  private addResult(tx: Tx, env: Envelope<unknown>, { topic, payload }: StoredResult) {
    this.bus.add(tx, { id: `${env.id}.result`, topic, key: env.id, payload, headers: metaFrom(env) });
  }
}

const row = (queue: string, messageId: string) =>
  and(eq(processed.queue, queue), eq(processed.messageId, messageId));

/** Catches a listener whose QUEUE constant differs from the queue the message came from. */
function checkQueue(ctx: unknown, queue: string) {
  const actual = (ctx as Partial<MessageContext> | undefined)?.queue;
  if (actual !== queue) throw new Error(`listener names queue ${queue} but the message came from ${String(actual)}`);
}

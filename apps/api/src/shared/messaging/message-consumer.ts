import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../database/database.module.js';
import type { Db, Tx } from '../database/database.module.js';
import type { Envelope } from './envelope.js';
import { MessageBus } from './message-bus.js';
import type { MessageContext } from './rabbit-transport.js';
import { processed } from './schema.js';

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
   * For work that calls an external system. There is no surrounding transaction and the work may run
   * twice: make the external call first, then record and publish inside bus.transaction.
   */
  async sideEffect<T>(ctx: unknown, env: Envelope<T>, queue: string, work: () => Promise<unknown>): Promise<void> {
    checkQueue(ctx, queue);
    const [seen] = await this.db
      .select({ messageId: processed.messageId })
      .from(processed)
      .where(and(eq(processed.queue, queue), eq(processed.messageId, env.id)));
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
}

/** Catches a listener whose QUEUE constant differs from the queue the message came from. */
function checkQueue(ctx: unknown, queue: string) {
  const actual = (ctx as Partial<MessageContext> | undefined)?.queue;
  if (actual !== queue) throw new Error(`listener names queue ${queue} but the message came from ${String(actual)}`);
}

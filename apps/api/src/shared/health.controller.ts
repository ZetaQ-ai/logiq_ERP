import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from './database/database.module.js';
import type { Db } from './database/database.module.js';
import { MessageBus } from './messaging/message-bus.js';

type Status = 'up' | 'down';

const TIMEOUT_MS = 2000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly bus: MessageBus,
  ) {}

  /** Liveness: the process is up. It never depends on Postgres or RabbitMQ, so an outage there causes no restart loop. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: 200 when Postgres and RabbitMQ are reachable, otherwise 503 naming what is down. */
  @Get()
  async ready() {
    const [database, rabbitmq] = await Promise.all([
      probe(() => this.db.execute(sql`select 1`)),
      probe(async () => {
        if (!this.bus.isConnected()) throw new Error('not connected');
      }),
    ]);
    // ponytail: only the publisher connection is checked; the consumer's reconnects on its own — add it when an orchestrator needs it
    const checks = { database, rabbitmq };
    if (database === 'up' && rabbitmq === 'up') return { status: 'ok', checks };
    this.logger.warn(`not ready: ${JSON.stringify(checks)}`);
    throw new ServiceUnavailableException({ status: 'error', checks });
  }
}

async function probe(check: () => Promise<unknown>): Promise<Status> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

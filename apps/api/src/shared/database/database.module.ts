import { Global, Inject, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export const DB = Symbol('DB');
export type Db = NodePgDatabase & { $client: pg.Pool };
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async (): Promise<Db> => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');
        // Fail a query after 5 s without a connection instead of waiting forever (pg's default).
        const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
        // An idle connection Postgres drops emits 'error'; unhandled, it would crash the process.
        // The pool discards that connection and opens new ones once Postgres is back.
        pool.on('error', (error) => new Logger('Database').error(`idle connection lost: ${error.message}`));
        const db = drizzle(pool, { casing: 'snake_case' });
        await db.execute(sql`select 1`); // fail fast if Postgres is unreachable
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  onApplicationShutdown() {
    return this.db.$client.end();
  }
}

import { Global, Inject, Module } from '@nestjs/common';
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
        const db = drizzle(new pg.Pool({ connectionString: url }), { casing: 'snake_case' });
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

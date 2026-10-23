import { pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const messaging = pgSchema('messaging');

/** Messages a queue has already handled, so redeliveries are skipped (coding standard 6.2). */
// ponytail: grows forever; add a retention job when it matters
export const processed = messaging.table(
  'processed',
  {
    queue: text().notNull(),
    messageId: text().notNull(), // stable ids set by modules need not be UUIDs
    processedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.queue, t.messageId] })],
);

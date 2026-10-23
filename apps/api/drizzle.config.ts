import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/modules/*/schema.ts', './src/shared/*/schema.ts'],
  out: './drizzle',
  casing: 'snake_case',
  // Add each module's Postgres schema here (coding standard 11.1, step 3).
  // schema.ts must export its pgSchema(...) object, or no CREATE SCHEMA is generated.
  schemaFilter: ['messaging'],
  dbCredentials: { url },
});

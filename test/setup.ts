import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { Pool } from 'pg';

config({ path: path.resolve(__dirname, '../.env.test') });

export async function setup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../drizzle') });

  await pool.end();
}

setup().catch((err) => {
  console.error('Test setup failed:', err);
  process.exit(1);
});

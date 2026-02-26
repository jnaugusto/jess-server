import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../src/database/database.service';

export async function cleanDatabase(databaseService: DatabaseService) {
  const db = databaseService.db;

  try {
    // Delete in correct FK order
    await db.execute(sql`DELETE FROM "sessions"`);
    await db.execute(sql`DELETE FROM "accounts"`);
    await db.execute(sql`DELETE FROM "verifications"`);
    await db.execute(sql`DELETE FROM "users"`);
  } catch (error: unknown) {
    console.error('Failed to clean database:', error);
    throw error;
  }
}

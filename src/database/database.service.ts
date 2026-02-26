import { Inject, Injectable } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService {
  public readonly db: NodePgDatabase<typeof schema>;

  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {
    this.db = drizzle(this.pool, { schema });
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  async getClient() {
    return this.pool.connect();
  }

  async close() {
    await this.pool.end();
  }

  async transaction<T>(callback: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
    return await this.db.transaction(callback);
  }
}

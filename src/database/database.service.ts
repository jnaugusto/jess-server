import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  async getClient() {
    return this.pool.connect();
  }

  async close() {
    await this.pool.end();
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

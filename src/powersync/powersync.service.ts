import { Injectable } from '@nestjs/common';
import * as jose from 'jose';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { env } from '../env';

export class PowerSyncOp {
  table!: string;
  op!: 'PUT' | 'PATCH' | 'DELETE';
  row!: Record<string, unknown>;
}

export class PowerSyncTransaction {
  ops!: PowerSyncOp[];
}

@Injectable()
export class PowerSyncService {
  constructor(private readonly databaseService: DatabaseService) {}

  async generateToken(userId: string) {
    const privateKey = await jose.importPKCS8(
      Buffer.from(env.POWERSYNC_JWT_PRIVATE_KEY, 'base64').toString('utf-8'),
      'RS256',
    );

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer('jess-server')
      .setAudience(env.POWERSYNC_URL)
      .setSubject(userId)
      .setExpirationTime('1h')
      .sign(privateKey);

    return jwt;
  }

  async handleUpload(userId: string, transaction: PowerSyncTransaction) {
    const ops = transaction.ops;

    await this.databaseService.transaction(async (client: PoolClient) => {
      for (const op of ops) {
        const { table, op: operation, row } = op;

        if (row.user_id && row.user_id !== userId) {
          throw new Error('Unauthorized');
        }

        switch (operation) {
          case 'PUT':
            await this.handlePut(client, table, row);
            break;
          case 'PATCH':
            await this.handlePatch(client, table, row);
            break;
          case 'DELETE':
            await this.handleDelete(client, table, row);
            break;
        }
      }
    });
  }

  private async handlePut(client: PoolClient, table: string, row: Record<string, any>) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = columns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${updates}
    `;

    await client.query(query, values);
  }

  private async handlePatch(client: PoolClient, table: string, row: Record<string, any>) {
    const { id, ...updates } = row;
    const columns = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = columns.map((col, i) => `${col} = $${String(i + 2)}`).join(', ');

    const query = `
      UPDATE ${table} SET ${setClause} WHERE id = $1
    `;

    await client.query(query, [id, ...values]);
  }

  private async handleDelete(client: PoolClient, table: string, row: Record<string, any>) {
    const { id } = row;
    const query = `DELETE FROM ${table} WHERE id = $1`;
    await client.query(query, [id]);
  }
}

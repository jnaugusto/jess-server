import { Injectable } from '@nestjs/common';
import * as jose from 'jose';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';
import * as schema from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { env } from '../env';

export class PowerSyncOp {
  @IsString()
  table!: string;

  @IsIn(['PUT', 'PATCH', 'DELETE'])
  op!: 'PUT' | 'PATCH' | 'DELETE';

  // `row` is freeform — its keys depend on the target table — so we only
  // validate that it is an object. ValidationPipe(whitelist:true) strips
  // unknown keys at the *class* level, not inside plain object values.
  @IsObject()
  row!: Record<string, unknown>;
}

export class PowerSyncTransaction {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PowerSyncOp)
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

    // The `kid` must match the entry in config/powersync.yaml's
    // client_auth.jwks. Without it, PowerSync can't pick a key from
    // its keystore and rejects with PSYNC_S2101.
    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'powersync-key-1' })
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

    await this.databaseService.transaction(async (tx) => {
      for (const op of ops) {
        const { table, op: operation, row } = op;

        if (row.user_id && row.user_id !== userId) {
          throw new Error('Unauthorized');
        }

        switch (operation) {
          case 'PUT':
            await this.handlePut(tx, table, row);
            break;
          case 'PATCH':
            await this.handlePatch(tx, table, row);
            break;
          case 'DELETE':
            await this.handleDelete(tx, table, row);
            break;
        }
      }
    });
  }

  private async handlePut(
    tx: NodePgDatabase<typeof schema>,
    table: string,
    row: Record<string, any>,
  ) {
    const columns = Object.keys(row);
    const values = Object.values(row);

    const query = sql`
      INSERT INTO ${sql.identifier(table)} (${sql.join(
        columns.map((c) => sql.identifier(c)),
        sql`, `,
      )})
      VALUES (${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `,
      )})
      ON CONFLICT (id) DO UPDATE SET ${sql.join(
        columns.map((col) => sql`${sql.identifier(col)} = EXCLUDED.${sql.identifier(col)}`),
        sql`, `,
      )}
    `;

    await tx.execute(query);
  }

  private async handlePatch(
    tx: NodePgDatabase<typeof schema>,
    table: string,
    row: Record<string, any>,
  ) {
    const { id, ...updates } = row;
    const columns = Object.keys(updates);
    const values = Object.values(updates);

    const query = sql`
      UPDATE ${sql.identifier(table)}
      SET ${sql.join(
        columns.map((col, i) => sql`${sql.identifier(col)} = ${values[i]}`),
        sql`, `,
      )}
      WHERE id = ${id}
    `;

    await tx.execute(query);
  }

  private async handleDelete(
    tx: NodePgDatabase<typeof schema>,
    table: string,
    row: Record<string, any>,
  ) {
    const { id } = row;
    const query = sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${id}`;
    await tx.execute(query);
  }
}

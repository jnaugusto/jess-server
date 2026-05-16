import { Injectable, Logger } from '@nestjs/common';
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
import { LocationsGateway } from '../locations/locations.gateway';
import { LocationsService } from '../locations/locations.service';
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
  private readonly logger = new Logger(PowerSyncService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly locationsService: LocationsService,
    private readonly locationsGateway: LocationsGateway,
  ) {}

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
      for (let i = 0; i < ops.length; i++) {
        const { table, op: operation, row } = ops[i];

        if (row.user_id && row.user_id !== userId) {
          throw new Error('Unauthorized');
        }

        const sp = `sp_${i}`;
        await tx.execute(sql.raw(`SAVEPOINT ${sp}`));

        try {
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
          await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
        } catch (err) {
          await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
          const rowId = typeof row.id === 'string' ? row.id : '?';
          this.logger.warn(
            `Skipping permanently-failing op ${operation} ${table}[${rowId}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });

    // After the DB transaction commits, fan out live broadcasts.
    // Failures here must NOT roll back the upload — at worst the
    // dashboard misses a tick and resyncs from the next one.
    try {
      await this.broadcastFromOps(userId, ops);
    } catch (err) {
      this.logger.warn(
        `broadcastFromOps failed for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Translate the just-applied CRUD ops into Socket.IO broadcasts so the
   * dashboard's /live page updates without a refresh. Handles two shapes:
   *
   *   - PUT location_points → emit `location:update` with the latest tick
   *     to every workspace that has this user as a driver. To keep volume
   *     down on big batches we only emit the newest point per driver-user.
   *
   *   - PUT/PATCH tracks where status flipped to 'completed' → emit
   *     `driver:offline` so the dot greys out immediately.
   */
  private async broadcastFromOps(uploaderUserId: string, ops: PowerSyncOp[]) {
    const latestPoint = new Map<
      string,
      {
        latitude: number;
        longitude: number;
        speed: number | null;
        heading: number | null;
        timestamp: number;
      }
    >();
    const completedTracks: string[] = [];

    for (const op of ops) {
      if (op.op !== 'PUT' && op.op !== 'PATCH') continue;
      const row = op.row as Record<string, unknown>;
      const rowUserId =
        typeof row.user_id === 'string' ? row.user_id : uploaderUserId;

      if (op.table === 'location_points') {
        const ts = Number(row.timestamp);
        if (!Number.isFinite(ts)) continue;
        const existing = latestPoint.get(rowUserId);
        if (existing && existing.timestamp >= ts) continue;
        latestPoint.set(rowUserId, {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          speed: row.speed != null ? Number(row.speed) : null,
          heading: row.heading != null ? Number(row.heading) : null,
          timestamp: ts,
        });
      } else if (op.table === 'tracks' && row.status === 'completed') {
        completedTracks.push(rowUserId);
      }
    }

    // Cache driver lookups so we don't hit Postgres once per op when the
    // same driver appears in many points.
    const driversByUser = new Map<
      string,
      Awaited<ReturnType<LocationsService['findDriversByDriverUserId']>>
    >();
    const lookup = async (driverUserId: string) => {
      let cached = driversByUser.get(driverUserId);
      if (!cached) {
        cached = await this.locationsService.findDriversByDriverUserId(
          driverUserId,
        );
        driversByUser.set(driverUserId, cached);
      }
      return cached;
    };

    for (const [driverUserId, point] of latestPoint) {
      const driverRows = await lookup(driverUserId);
      for (const meta of driverRows) {
        const payload = this.locationsService.buildBroadcastPayload(point, {
          driverId: meta.driverId,
          driverName: meta.driverName,
          driverCode: meta.driverCode,
          vehicleName: meta.vehicleName,
        });
        this.locationsGateway.broadcastLocation(
          meta.workspaceOwnerUserId,
          payload,
        );
      }
    }

    for (const driverUserId of completedTracks) {
      const driverRows = await lookup(driverUserId);
      // If the phone is still on the live socket → flip to standby.
      // If the phone is gone → the disconnect handler already removed
      // them from the dashboard, nothing more to do here.
      if (this.locationsGateway.isUserOnline(driverUserId)) {
        for (const meta of driverRows) {
          this.locationsGateway.markDriverAvailable(
            meta.workspaceOwnerUserId,
            meta.driverId,
          );
        }
      }
    }
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

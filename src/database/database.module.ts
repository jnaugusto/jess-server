import { Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from '../env';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        return new Pool({
          connectionString: env.DATABASE_URL,
        });
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService, 'DATABASE_POOL'],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.databaseService.query('SELECT 1');
      this.logger.log('Database connected successfully');
      await this.runMigrations();
    } catch (e) {
      this.logger.error(
        `Failed to connect to database: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Idempotent startup migrations — safe to run every boot.
   * All DDL uses IF NOT EXISTS / IF EXISTS so re-running is a no-op.
   * Backfills are guarded by IS NULL / exact-match counts so they
   * only touch rows that genuinely need data.
   */
  private async runMigrations() {
    // ── tracks: geocoding columns (original) ────────────────────────────────
    await this.databaseService.query(
      `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS start_geocode text`,
    );
    await this.databaseService.query(
      `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS end_geocode text`,
    );

    // ── tracks: fleet context columns ────────────────────────────────────────
    // Record which driver membership + vehicle was active when a trip started.
    await this.databaseService.query(
      `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS driver_id text`,
    );
    await this.databaseService.query(
      `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS vehicle_id text`,
    );

    // ── driver_invites: invite-opened tracking ───────────────────────────────
    // Set when the driver first clicks the invite link — before account creation.
    await this.databaseService.query(
      `ALTER TABLE driver_invites ADD COLUMN IF NOT EXISTS opened_at timestamp`,
    );

    // ── drivers: unique constraint — one user per fleet, many fleets per user ─
    // Old constraint: unique on (driver_user_id) — prevented multi-fleet.
    // New constraint: unique on (owner_user_id, driver_user_id) — allows it.
    await this.databaseService.query(
      `DROP INDEX IF EXISTS uq_drivers_driver_user_id`,
    );
    await this.databaseService.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_fleet_membership
        ON drivers (owner_user_id, driver_user_id)
        WHERE driver_user_id IS NOT NULL
    `);

    this.logger.log('Schema migrations applied.');

    // ── Backfill: driver_id on existing tracks ───────────────────────────────
    // For drivers who belong to exactly one fleet, we can safely infer which
    // fleet a trip belonged to. Multi-fleet drivers are left NULL — they will
    // get a driver_id on their next trip via the fleet selector.
    const { rowCount: driverBackfilled } = await this.databaseService.query(`
      UPDATE tracks t
      SET driver_id = d.id
      FROM drivers d
      WHERE t.user_id        = d.driver_user_id
        AND t.driver_id      IS NULL
        AND d.status         = 'active'
        AND (
          SELECT COUNT(*)
          FROM   drivers d2
          WHERE  d2.driver_user_id = d.driver_user_id
            AND  d2.status         = 'active'
        ) = 1
    `);
    if (driverBackfilled && driverBackfilled > 0) {
      this.logger.log(`Backfilled driver_id on ${driverBackfilled} tracks.`);
    }

    // ── Backfill: vehicle_id on existing tracks ──────────────────────────────
    // For fleets that have exactly one non-decommissioned vehicle, we can
    // safely assign it to the track. Fleets with multiple vehicles are left
    // NULL — the driver will set context via the fleet selector next time.
    // Also checks assignedVehicleId on the driver record as a first preference.
    const { rowCount: vehicleFromAssigned } = await this.databaseService.query(`
      UPDATE tracks t
      SET vehicle_id = d.assigned_vehicle_id
      FROM drivers d
      WHERE t.driver_id    = d.id
        AND t.vehicle_id   IS NULL
        AND d.assigned_vehicle_id IS NOT NULL
    `);
    if (vehicleFromAssigned && vehicleFromAssigned > 0) {
      this.logger.log(`Backfilled vehicle_id from assigned vehicle on ${vehicleFromAssigned} tracks.`);
    }

    const { rowCount: vehicleFromSingle } = await this.databaseService.query(`
      UPDATE tracks t
      SET vehicle_id = (
        SELECT v.id
        FROM   vehicles v
        WHERE  v.owner_user_id = d.owner_user_id
          AND  v.status       != 'decommissioned'
        LIMIT  1
      )
      FROM drivers d
      WHERE t.driver_id  = d.id
        AND t.vehicle_id IS NULL
        AND (
          SELECT COUNT(*)
          FROM   vehicles v2
          WHERE  v2.owner_user_id = d.owner_user_id
            AND  v2.status       != 'decommissioned'
        ) = 1
    `);
    if (vehicleFromSingle && vehicleFromSingle > 0) {
      this.logger.log(`Backfilled vehicle_id from single fleet vehicle on ${vehicleFromSingle} tracks.`);
    }

    // ── Backfill: owner_user_id on orphaned drivers → demo@demo.com ─────────
    // Drivers created before the fleet system may have a NULL owner_user_id.
    // Assign them to demo@demo.com so they appear in the demo fleet.
    // Guard: only runs if demo@demo.com exists and there are NULL rows to fix.
    const { rowCount: demoDriversFixed } = await this.databaseService.query(`
      UPDATE drivers
      SET owner_user_id = u.id
      FROM users u
      WHERE u.email          = 'demo@demo.com'
        AND drivers.owner_user_id IS NULL
    `);
    if (demoDriversFixed && demoDriversFixed > 0) {
      this.logger.log(`Linked ${demoDriversFixed} orphaned driver(s) to demo@demo.com.`);
    }

    this.logger.log('Data backfill complete.');
  }

  async onModuleDestroy() {
    await this.databaseService.close();
  }
}

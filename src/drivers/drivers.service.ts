import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, ilike, or, inArray, count, sum, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, tracks, vehicles, users, userSettings } from '../database/schema';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@Injectable()
export class DriversService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string, status?: string, q?: string) {
    const conditions = [eq(drivers.ownerUserId, userId)];
    if (status) conditions.push(eq(drivers.status, status));
    if (q) {
      conditions.push(
        or(ilike(drivers.fullName, `%${q}%`), ilike(drivers.code, `%${q}%`))!,
      );
    }

    const rows = await this.db.db
      .select()
      .from(drivers)
      .where(and(...conditions))
      .orderBy(desc(drivers.createdAt));

    const driverUserIds = rows
      .filter((d) => d.driverUserId)
      .map((d) => d.driverUserId as string);

    const [stats, vehicleRows] = await Promise.all([
      driverUserIds.length > 0
        ? this.db.db
            .select({
              userId: tracks.userId,
              totalTrips: count(tracks.id),
              totalDistance: sum(tracks.distance),
            })
            .from(tracks)
            .where(inArray(tracks.userId, driverUserIds))
            .groupBy(tracks.userId)
        : [],
      this.db.db
        .select({ id: vehicles.id, code: vehicles.code, plate: vehicles.plate })
        .from(vehicles)
        .where(eq(vehicles.ownerUserId, userId)),
    ]);

    const statsMap = new Map(stats.map((s) => [s.userId, s]));
    const vehicleMap = new Map(vehicleRows.map((v) => [v.id, v]));

    return rows.map((d) => {
      const s = statsMap.get(d.driverUserId ?? '');
      const v = d.assignedVehicleId ? vehicleMap.get(d.assignedVehicleId) : null;
      return {
        ...d,
        totalTrips: Number(s?.totalTrips ?? 0),
        totalDistance: Number(s?.totalDistance ?? 0),
        lastActive: d.lastActiveAt?.toISOString() ?? null,
        assignedVehicle: v ? `${v.code} · ${v.plate}` : null,
      };
    });
  }

  async getById(userId: string, id: string) {
    const [driver] = await this.db.db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.ownerUserId, userId)))
      .limit(1);
    if (!driver) throw new NotFoundException(`Driver ${id} not found.`);
    return driver;
  }

  async create(userId: string, dto: CreateDriverDto) {
    const id = crypto.randomUUID();
    const [driver] = await this.db.db
      .insert(drivers)
      .values({ id, ownerUserId: userId, ...dto })
      .returning();
    return driver;
  }

  async update(userId: string, id: string, dto: UpdateDriverDto) {
    const [driver] = await this.db.db
      .update(drivers)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(drivers.id, id), eq(drivers.ownerUserId, userId)))
      .returning();
    if (!driver) throw new NotFoundException(`Driver ${id} not found.`);
    return driver;
  }

  async deactivate(userId: string, id: string) {
    return this.update(userId, id, { status: 'deactivated' });
  }

  /**
   * Returns all active fleet memberships for a driver user — used by the
   * mobile app's fleet selector shown before tracking starts.
   * Each fleet includes all non-decommissioned vehicles so the driver can
   * pick the vehicle they're using that day.
   */
  async getMyFleets(driverUserId: string) {
    const driverRecords = await this.db.db
      .select({
        id: drivers.id,
        code: drivers.code,
        ownerUserId: drivers.ownerUserId,
        status: drivers.status,
      })
      .from(drivers)
      .where(and(eq(drivers.driverUserId, driverUserId), eq(drivers.status, 'active')));

    if (driverRecords.length === 0) return [];

    const ownerIds = [...new Set(driverRecords.map((d) => d.ownerUserId))];

    const [ownerUsers, ownerSettingsRows, vehicleRows] = await Promise.all([
      this.db.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, ownerIds)),
      this.db.db
        .select({ userId: userSettings.userId, orgName: userSettings.orgName })
        .from(userSettings)
        .where(inArray(userSettings.userId, ownerIds)),
      this.db.db
        .select({
          id: vehicles.id,
          ownerUserId: vehicles.ownerUserId,
          code: vehicles.code,
          plate: vehicles.plate,
          make: vehicles.make,
          model: vehicles.model,
          type: vehicles.type,
          status: vehicles.status,
        })
        .from(vehicles)
        .where(
          and(
            inArray(vehicles.ownerUserId, ownerIds),
            ne(vehicles.status, 'decommissioned'),
          ),
        ),
    ]);

    const ownerMap = new Map(ownerUsers.map((u) => [u.id, u.name]));
    const settingsMap = new Map(ownerSettingsRows.map((s) => [s.userId, s.orgName]));

    const vehiclesByOwner = new Map<string, typeof vehicleRows>();
    for (const v of vehicleRows) {
      if (!vehiclesByOwner.has(v.ownerUserId)) vehiclesByOwner.set(v.ownerUserId, []);
      vehiclesByOwner.get(v.ownerUserId)!.push(v);
    }

    return driverRecords.map((d) => ({
      driverId: d.id,
      driverCode: d.code,
      orgName: settingsMap.get(d.ownerUserId) || ownerMap.get(d.ownerUserId) || 'Unknown Fleet',
      ownerName: ownerMap.get(d.ownerUserId) || 'Unknown',
      vehicles: vehiclesByOwner.get(d.ownerUserId) ?? [],
    }));
  }

  async delete(userId: string, id: string) {
    const [driver] = await this.db.db
      .delete(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.ownerUserId, userId)))
      .returning();
    if (!driver) throw new NotFoundException(`Driver ${id} not found.`);
    return driver;
  }
}

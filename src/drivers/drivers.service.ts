import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, ilike, or, inArray, count, sum } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, tracks, vehicles } from '../database/schema';
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

  async delete(userId: string, id: string) {
    const [driver] = await this.db.db
      .delete(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.ownerUserId, userId)))
      .returning();
    if (!driver) throw new NotFoundException(`Driver ${id} not found.`);
    return driver;
  }
}

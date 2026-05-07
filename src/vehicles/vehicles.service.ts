import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, gte, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, locationPoints, tracks, vehicles } from '../database/schema';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

export type VehicleStatus = 'in_use' | 'idle' | 'available' | 'maintenance';

export interface VehicleListItem {
  id: string;
  code: string;
  name: string;
  plate: string;
  make?: string;
  model?: string;
  year?: number;
  type?: string;
  status: VehicleStatus;
  assignedDriver?: { id: string; fullName: string } | null;
  currentSpeed?: number;
  odometerKm?: number;
  tripsPerWeek?: number;
  kmToService?: number;
  serviceOverdue?: boolean;
  lastDrivenAt?: string;
  lastDrivenBy?: string;
  alert?: { tone: 'warn' | 'danger'; text: string } | null;
}

export interface MaintenanceEntry {
  id: string;
  date: string;
  vehicleCode: string;
  vehicleName: string;
  plate: string;
  detail: string;
  severity: 'info' | 'warn' | 'danger';
  cta?: string;
}

const ALLOWED_STATUSES: ReadonlySet<VehicleStatus> = new Set<VehicleStatus>([
  'in_use',
  'idle',
  'available',
  'maintenance',
]);

function normaliseStatus(status: string | null | undefined): VehicleStatus {
  if (status && ALLOWED_STATUSES.has(status as VehicleStatus)) {
    return status as VehicleStatus;
  }
  return 'available';
}

function vehicleDisplayName(make?: string | null, model?: string | null) {
  return [make, model].filter(Boolean).join(' ') || 'Vehicle';
}

@Injectable()
export class VehiclesService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string, status?: string): Promise<VehicleListItem[]> {
    const conditions = [eq(vehicles.ownerUserId, userId)];
    if (status && ALLOWED_STATUSES.has(status as VehicleStatus)) {
      conditions.push(eq(vehicles.status, status));
    }

    const vehicleRows = await this.db.db
      .select()
      .from(vehicles)
      .where(and(...conditions))
      .orderBy(desc(vehicles.createdAt));

    if (vehicleRows.length === 0) return [];

    const driverIds = vehicleRows
      .map((v) => v.assignedDriverId)
      .filter((id): id is string => !!id);

    const driverRows = driverIds.length
      ? await this.db.db
          .select({
            id: drivers.id,
            fullName: drivers.fullName,
            driverUserId: drivers.driverUserId,
          })
          .from(drivers)
          .where(inArray(drivers.id, driverIds))
      : [];
    const driverById = new Map(driverRows.map((d) => [d.id, d]));

    const driverUserIds = driverRows
      .map((d) => d.driverUserId)
      .filter((id): id is string => !!id);

    const lastPoints = driverUserIds.length
      ? await this.db.db
          .execute<{
            userId: string;
            speed: number | null;
            timestamp: number;
          }>(sql`
            SELECT DISTINCT ON (${locationPoints.userId})
              ${locationPoints.userId}    AS "userId",
              ${locationPoints.speed}     AS speed,
              ${locationPoints.timestamp} AS timestamp
            FROM ${locationPoints}
            WHERE ${inArray(locationPoints.userId, driverUserIds)}
            ORDER BY ${locationPoints.userId}, ${locationPoints.timestamp} DESC
          `)
          .then((res: any) => (res.rows ?? res) as any[])
      : [];
    const pointByUser = new Map(lastPoints.map((p) => [p.userId, p]));

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const tripCounts = await this.db.db
      .select({
        deviceId: tracks.deviceId,
        count: sql<number>`count(*)::int`,
      })
      .from(tracks)
      .where(and(eq(tracks.userId, userId), gte(tracks.startTime, sevenDaysAgo)))
      .groupBy(tracks.deviceId);
    const tripsByDevice = new Map(
      tripCounts
        .filter((t) => !!t.deviceId)
        .map((t) => [t.deviceId as string, t.count]),
    );

    return vehicleRows.map((v) => {
      const status = normaliseStatus(v.status);
      const driver = v.assignedDriverId
        ? driverById.get(v.assignedDriverId)
        : undefined;
      const point = driver?.driverUserId
        ? pointByUser.get(driver.driverUserId)
        : undefined;

      const currentSpeed =
        status === 'in_use' && point?.speed != null
          ? Math.round((Number(point.speed) * 3.6) * 10) / 10
          : undefined;

      const kmToService =
        v.nextServiceKm != null
          ? Math.round((Number(v.nextServiceKm) - Number(v.odometerKm)) * 10) /
            10
          : undefined;
      const serviceOverdue =
        kmToService != null ? kmToService < 0 : false;

      const tripsPerWeek = v.code ? tripsByDevice.get(v.code) : undefined;

      const alert = serviceOverdue
        ? {
            tone: 'warn' as const,
            text: `Service overdue · ${Math.abs(kmToService!).toFixed(0)} km past`,
          }
        : null;

      return {
        id: v.id,
        code: v.code,
        name: vehicleDisplayName(v.make, v.model),
        plate: v.plate,
        make: v.make ?? undefined,
        model: v.model ?? undefined,
        year: v.year ?? undefined,
        type: v.type ?? undefined,
        status,
        assignedDriver: driver
          ? { id: driver.id, fullName: driver.fullName }
          : null,
        currentSpeed,
        odometerKm: Number(v.odometerKm) || 0,
        tripsPerWeek,
        kmToService,
        serviceOverdue,
        lastDrivenAt: point ? new Date(Number(point.timestamp)).toISOString() : undefined,
        lastDrivenBy: !driver && point ? undefined : undefined,
        alert,
      } satisfies VehicleListItem;
    });
  }

  async maintenance(
    userId: string,
    days = 30,
  ): Promise<MaintenanceEntry[]> {
    const list = await this.list(userId);
    const overdue = list.filter((v) => v.serviceOverdue || (v.kmToService != null && v.kmToService < 1500));
    const today = new Date();
    return overdue.map((v) => {
      const d = new Date(today);
      const detail =
        v.serviceOverdue && v.kmToService != null
          ? `Service overdue · ${Math.abs(v.kmToService).toFixed(0)} km past`
          : v.kmToService != null
            ? `Routine service · ${v.kmToService.toFixed(0)} km remaining`
            : 'Routine service';
      const severity: MaintenanceEntry['severity'] = v.serviceOverdue
        ? 'danger'
        : 'warn';
      // Spread the upcoming items across the next `days` window.
      const offsetDays = v.serviceOverdue ? 0 : Math.min(days, 14);
      d.setDate(d.getDate() + offsetDays);
      return {
        id: `vehicle-${v.id}`,
        date: d
          .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
          .toUpperCase(),
        vehicleCode: v.code,
        vehicleName: v.name,
        plate: v.plate,
        detail,
        severity,
        cta: 'Schedule',
      };
    });
  }

  async getById(userId: string, id: string) {
    const [vehicle] = await this.db.db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.ownerUserId, userId)))
      .limit(1);
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found.`);
    return vehicle;
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const id = crypto.randomUUID();
    const [vehicle] = await this.db.db
      .insert(vehicles)
      .values({ id, ownerUserId: userId, ...dto })
      .returning();
    return vehicle;
  }

  async update(userId: string, id: string, dto: UpdateVehicleDto) {
    const [vehicle] = await this.db.db
      .update(vehicles)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(vehicles.id, id), eq(vehicles.ownerUserId, userId)))
      .returning();
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found.`);
    return vehicle;
  }

  async delete(userId: string, id: string) {
    const [vehicle] = await this.db.db
      .delete(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.ownerUserId, userId)))
      .returning();
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found.`);
    return vehicle;
  }
}

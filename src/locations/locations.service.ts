import { Injectable } from '@nestjs/common';
import { and, between, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, locationPoints, vehicles } from '../database/schema';
import { locationsOld as locations } from '../database/schema.old';
import { GetLocationsDto } from './dto/get-locations.dto';

export type LiveStatus = 'moving' | 'idle' | 'alert' | 'offline';

export interface LiveLocation {
  driverId: string;
  driverName: string;
  driverCode: string;
  vehicleName?: string;
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  status: LiveStatus;
  locationLabel?: string;
  updatedAt: string;
}

const STALE_AFTER_MS = 5 * 60 * 1000; // > 5 min => offline
const IDLE_SPEED_KMH = 1; // ≤ this => idle
const ALERT_SPEED_KMH = 90; // ≥ this => alert

function deriveStatus(
  speedKmh: number,
  ageMs: number,
  speedAlertThreshold = ALERT_SPEED_KMH,
): LiveStatus {
  if (ageMs > STALE_AFTER_MS) return 'offline';
  if (speedKmh >= speedAlertThreshold) return 'alert';
  if (speedKmh <= IDLE_SPEED_KMH) return 'idle';
  return 'moving';
}

@Injectable()
export class LocationsService {
  constructor(private readonly db: DatabaseService) {}

  async getLocations(userId: string, dto: GetLocationsDto) {
    return this.db.db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.userId, userId),
          eq(locations.deviceId, dto.deviceId),
          between(locations.timestamp, String(dto.from), String(dto.to)),
        ),
      )
      .orderBy(locations.timestamp);
  }

  async getDevices(userId: string) {
    const rows = await this.db.db
      .selectDistinct({ deviceId: locations.deviceId })
      .from(locations)
      .where(eq(locations.userId, userId));

    return rows.map((r) => r.deviceId);
  }

  async findDriverForEmit(workspaceUserId: string, driverId?: string) {
    const baseConditions = [eq(drivers.ownerUserId, workspaceUserId)];
    if (driverId) baseConditions.push(eq(drivers.id, driverId));

    const [driver] = await this.db.db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        code: drivers.code,
        assignedVehicleId: drivers.assignedVehicleId,
      })
      .from(drivers)
      .where(and(...baseConditions))
      .limit(1);

    if (!driver) return null;

    const vehicle = driver.assignedVehicleId
      ? (
          await this.db.db
            .select({
              plate: vehicles.plate,
              make: vehicles.make,
              model: vehicles.model,
            })
            .from(vehicles)
            .where(eq(vehicles.id, driver.assignedVehicleId))
            .limit(1)
        )[0]
      : undefined;

    const vehicleName = vehicle
      ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') +
        (vehicle.plate ? ` · ${vehicle.plate}` : '')
      : undefined;

    return {
      driverId: driver.id,
      driverName: driver.fullName,
      driverCode: driver.code,
      vehicleName: vehicleName || undefined,
    };
  }

  /**
   * Last-known position per driver in the workspace.
   * Pulls the most recent location_point per driver_user_id, joins driver
   * + vehicle for display labels, and derives moving/idle/alert/offline.
   */
  async getLiveLocations(workspaceUserId: string): Promise<LiveLocation[]> {
    const driverRows = await this.db.db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        code: drivers.code,
        driverUserId: drivers.driverUserId,
        assignedVehicleId: drivers.assignedVehicleId,
      })
      .from(drivers)
      .where(eq(drivers.ownerUserId, workspaceUserId));

    if (driverRows.length === 0) return [];

    const driverUserIds = driverRows
      .map((d) => d.driverUserId)
      .filter((v): v is string => !!v);

    const vehicleIds = driverRows
      .map((d) => d.assignedVehicleId)
      .filter((v): v is string => !!v);

    const vehicleRows = vehicleIds.length
      ? await this.db.db
          .select({
            id: vehicles.id,
            plate: vehicles.plate,
            make: vehicles.make,
            model: vehicles.model,
          })
          .from(vehicles)
          .where(inArray(vehicles.id, vehicleIds))
      : [];
    const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));

    let lastPoints: {
      userId: string;
      latitude: number;
      longitude: number;
      speed: number | null;
      heading: number | null;
      timestamp: number;
    }[] = [];

    if (driverUserIds.length > 0) {
      lastPoints = await this.db.db.execute<{
        userId: string;
        latitude: number;
        longitude: number;
        speed: number | null;
        heading: number | null;
        timestamp: number;
      }>(sql`
        SELECT DISTINCT ON (${locationPoints.userId})
          ${locationPoints.userId}    AS "userId",
          ${locationPoints.latitude}  AS latitude,
          ${locationPoints.longitude} AS longitude,
          ${locationPoints.speed}     AS speed,
          ${locationPoints.heading}   AS heading,
          ${locationPoints.timestamp} AS timestamp
        FROM ${locationPoints}
        WHERE ${inArray(locationPoints.userId, driverUserIds)}
        ORDER BY ${locationPoints.userId}, ${locationPoints.timestamp} DESC
      `).then((res: any) => res.rows ?? res);
    }

    const pointByUser = new Map(lastPoints.map((p) => [p.userId, p]));
    const now = Date.now();
    const out: LiveLocation[] = [];

    for (const d of driverRows) {
      const point = d.driverUserId ? pointByUser.get(d.driverUserId) : null;
      if (!point) continue;
      const speedKmh = (point.speed ?? 0) * 3.6;
      const ageMs = now - Number(point.timestamp);
      const veh = d.assignedVehicleId
        ? vehicleById.get(d.assignedVehicleId)
        : undefined;
      const vehicleName = veh
        ? [veh.make, veh.model].filter(Boolean).join(' ') +
          (veh.plate ? ` · ${veh.plate}` : '')
        : undefined;

      out.push({
        driverId: d.id,
        driverName: d.fullName,
        driverCode: d.code,
        vehicleName: vehicleName || undefined,
        lat: Number(point.latitude),
        lng: Number(point.longitude),
        speed: Math.round(speedKmh * 10) / 10,
        heading: point.heading != null ? Number(point.heading) : undefined,
        status: deriveStatus(speedKmh, ageMs),
        updatedAt: new Date(Number(point.timestamp)).toISOString(),
      });
    }

    return out;
  }
}

import { Injectable } from '@nestjs/common';
import { and, between, desc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, locationPoints, vehicles } from '../database/schema';
import { locationsOld as locations } from '../database/schema.old';
import { GetLocationsDto } from './dto/get-locations.dto';

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? '';

export type LiveStatus = 'driving' | 'stopped' | 'speeding' | 'standby';

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
  // Stale last-known point ⇒ "standby" (driver isn't actively in a trip).
  // The "should we even show them?" filter is enforced separately at the
  // gateway level based on socket presence.
  if (ageMs > STALE_AFTER_MS) return 'standby';
  if (speedKmh >= speedAlertThreshold) return 'speeding';
  if (speedKmh <= IDLE_SPEED_KMH) return 'stopped';
  return 'driving';
}

@Injectable()
export class LocationsService {
  private readonly labelCache = new Map<string, { label: string; geocodedAt: number }>();
  private static readonly LABEL_TTL_MS = 5 * 60 * 1_000;

  constructor(private readonly db: DatabaseService) {}

  getCachedLabel(driverUserId: string): string | undefined {
    return this.labelCache.get(driverUserId)?.label;
  }

  async refreshLabelIfStale(driverUserId: string, lat: number, lng: number): Promise<void> {
    const entry = this.labelCache.get(driverUserId);
    if (entry && Date.now() - entry.geocodedAt < LocationsService.LABEL_TTL_MS) return;
    if (!MAPBOX_TOKEN) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,neighborhood,locality,place&limit=1`;
      const res = await fetch(url);
      if (!res.ok) return;
      const geocode = await res.json() as any;
      const feature = geocode?.features?.[0];
      if (!feature) return;
      // Walk context for place > locality > neighborhood
      const ctx: Array<{ id: string; text: string }> = feature.context ?? [];
      let label: string | undefined;
      for (const kind of ['place', 'locality', 'neighborhood']) {
        const found = ctx.find((c) => c.id?.startsWith(kind + '.'));
        if (found?.text) { label = found.text; break; }
      }
      if (!label) {
        const name = feature.place_name as string | undefined;
        label = name?.split(',')[0].trim() || undefined;
      }
      if (label) {
        this.labelCache.set(driverUserId, { label, geocodedAt: Date.now() });
      }
    } catch {
      // silently ignore geocoding errors
    }
  }

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

  /**
   * Cheap batched lookup: driverId → driverUserId. Used by the gateway
   * to enrich a snapshot with presence info without changing the public
   * LiveLocation shape.
   */
  async mapDriverIdToDriverUserId(driverIds: string[]) {
    if (driverIds.length === 0) return new Map<string, string>();
    const rows = await this.db.db
      .select({ id: drivers.id, driverUserId: drivers.driverUserId })
      .from(drivers)
      .where(inArray(drivers.id, driverIds));
    const out = new Map<string, string>();
    for (const r of rows) {
      if (r.driverUserId) out.set(r.id, r.driverUserId);
    }
    return out;
  }

  /**
   * Reverse lookup: given a *driver's* user_id (the user who actually
   * recorded the location), find every (workspaceOwnerUserId, driverRow,
   * vehicleRow) tuple that should receive a live broadcast.
   *
   * A single user can be a driver under multiple workspaces — e.g.
   * jessnoelaugusto@gmail.com owns her own workspace AND is a driver
   * under demo@demo.com — so this can return more than one row.
   */
  async findDriversByDriverUserId(driverUserId: string) {
    const driverRows = await this.db.db
      .select({
        id: drivers.id,
        ownerUserId: drivers.ownerUserId,
        fullName: drivers.fullName,
        code: drivers.code,
        assignedVehicleId: drivers.assignedVehicleId,
      })
      .from(drivers)
      .where(eq(drivers.driverUserId, driverUserId));

    if (driverRows.length === 0) return [];

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

    return driverRows.map((d) => {
      const veh = d.assignedVehicleId
        ? vehicleById.get(d.assignedVehicleId)
        : undefined;
      const vehicleName = veh
        ? [veh.make, veh.model].filter(Boolean).join(' ') +
          (veh.plate ? ` · ${veh.plate}` : '')
        : undefined;
      return {
        workspaceOwnerUserId: d.ownerUserId,
        driverId: d.id,
        driverName: d.fullName,
        driverCode: d.code,
        vehicleName: vehicleName || undefined,
      };
    });
  }

  /**
   * Translate a raw location-point row + driver/vehicle metadata into
   * the broadcast envelope the dashboard's /live page expects.
   */
  buildBroadcastPayload(
    point: {
      latitude: number | string;
      longitude: number | string;
      speed: number | string | null;
      heading: number | string | null;
      timestamp: number | string;
    },
    meta: {
      driverId: string;
      driverName: string;
      driverCode: string;
      vehicleName?: string;
      locationLabel?: string;
    },
  ): LiveLocation {
    const speedKmh = (Number(point.speed) || 0) * 3.6;
    const ts = Number(point.timestamp);
    const ageMs = Date.now() - ts;
    return {
      driverId: meta.driverId,
      driverName: meta.driverName,
      driverCode: meta.driverCode,
      vehicleName: meta.vehicleName,
      lat: Number(point.latitude),
      lng: Number(point.longitude),
      speed: Math.round(speedKmh * 10) / 10,
      heading: point.heading != null ? Number(point.heading) : undefined,
      status: deriveStatus(speedKmh, ageMs),
      locationLabel: meta.locationLabel,
      updatedAt: new Date(ts).toISOString(),
    };
  }

  async getLastLocationForDriverUser(driverUserId: string): Promise<{
    lat: number;
    lng: number;
    speed: number;
    heading?: number;
    timestamp: number;
  } | null> {
    const rows = await this.db.db
      .select({
        latitude: locationPoints.latitude,
        longitude: locationPoints.longitude,
        speed: locationPoints.speed,
        heading: locationPoints.heading,
        timestamp: locationPoints.timestamp,
      })
      .from(locationPoints)
      .where(eq(locationPoints.userId, driverUserId))
      .orderBy(desc(locationPoints.timestamp))
      .limit(1);
    if (rows.length === 0) return null;
    const p = rows[0];
    return {
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      speed: Math.round((Number(p.speed) || 0) * 3.6 * 10) / 10,
      heading: p.heading != null ? Number(p.heading) : undefined,
      timestamp: Number(p.timestamp),
    };
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

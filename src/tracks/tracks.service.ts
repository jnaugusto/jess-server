import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { extractPlace, buildGeocodeUrl, geocodeNeedsRefresh } from '../common/geocode/extract-place';
import { DatabaseService } from '../database/database.service';
import { tracks, locationPoints, drivers, vehicles } from '../database/schema';

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? '';

async function geocodePoint(lat: number, lng: number): Promise<unknown> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const res = await fetch(buildGeocodeUrl(lng, lat, MAPBOX_TOKEN));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function parseGeocode(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type TripEvent = {
  id: string;
  type: 'start' | 'stop' | 'idle' | 'speeding' | 'harsh_braking' | 'geofence';
  timestamp: string;
  description: string;
  location?: string;
};

// Speed is stored in m/s in location_points (raw GPS value).
const SPEED_ALERT_MS = 25;  // 90 km/h
const IDLE_SPEED_MS  = 0.56; // 2 km/h
const IDLE_MIN_MS    = 2 * 60 * 1000; // 2 min stop before it's logged

function deriveEvents(
  trackId: string,
  startTime: number,
  endTime: number | null | undefined,
  status: string,
  points: Array<{ timestamp: number; speed: number | null }>,
): TripEvent[] {
  const events: TripEvent[] = [];

  events.push({
    id: `${trackId}-start`,
    type: 'start',
    timestamp: new Date(startTime).toISOString(),
    description: 'Trip started',
  });

  let speedingActive = false;
  let speedingIdx = 0;
  let idleStart: number | null = null;
  let idleIdx = 0;

  for (const p of points) {
    const s = p.speed ?? 0;

    // Speeding — emit one event per speeding episode (leading edge).
    if (s >= SPEED_ALERT_MS && !speedingActive) {
      speedingActive = true;
      events.push({
        id: `${trackId}-speeding-${speedingIdx++}`,
        type: 'speeding',
        timestamp: new Date(p.timestamp).toISOString(),
        description: `Speed alert · exceeded ${Math.round(SPEED_ALERT_MS * 3.6)} km/h`,
      });
    } else if (s < SPEED_ALERT_MS) {
      speedingActive = false;
    }

    // Idle — log when a stop lasting ≥ 2 min ends (or at end of trip).
    if (s <= IDLE_SPEED_MS && idleStart === null) {
      idleStart = p.timestamp;
    } else if (s > IDLE_SPEED_MS && idleStart !== null) {
      const dur = p.timestamp - idleStart;
      if (dur >= IDLE_MIN_MS) {
        events.push({
          id: `${trackId}-idle-${idleIdx++}`,
          type: 'idle',
          timestamp: new Date(idleStart).toISOString(),
          description: `Stopped for ${Math.round(dur / 60000)} min`,
        });
      }
      idleStart = null;
    }
  }

  // Flush idle period that ran to end of trip.
  if (idleStart !== null && points.length > 0) {
    const dur = points[points.length - 1].timestamp - idleStart;
    if (dur >= IDLE_MIN_MS) {
      events.push({
        id: `${trackId}-idle-${idleIdx}`,
        type: 'idle',
        timestamp: new Date(idleStart).toISOString(),
        description: `Stopped for ${Math.round(dur / 60000)} min`,
      });
    }
  }

  // Stop event only for completed trips.
  if (status !== 'active') {
    const stopTs = endTime ?? (points.length > 0 ? points[points.length - 1].timestamp : startTime);
    events.push({
      id: `${trackId}-stop`,
      type: 'stop',
      timestamp: new Date(stopTs).toISOString(),
      description: 'Trip completed',
    });
  }

  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function computeIdleTimeSec(points: Array<{ timestamp: number; speed: number | null }>): number {
  let idleSec = 0;
  let start: number | null = null;
  for (const p of points) {
    const s = p.speed ?? 0;
    if (s <= IDLE_SPEED_MS && start === null) {
      start = p.timestamp;
    } else if (s > IDLE_SPEED_MS && start !== null) {
      idleSec += Math.round((p.timestamp - start) / 1000);
      start = null;
    }
  }
  if (start !== null && points.length > 0) {
    idleSec += Math.round((points[points.length - 1].timestamp - start) / 1000);
  }
  return idleSec;
}

function computeElevationGain(points: Array<{ elevation: number | null }>): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].elevation;
    const curr = points[i].elevation;
    if (prev != null && curr != null && curr > prev) gain += curr - prev;
  }
  return Math.round(gain);
}

@Injectable()
export class TracksService {
  private readonly logger = new Logger(TracksService.name);
  /** Prevents concurrent backfill runs (startup + lazy list trigger). */
  private geocodeRunning = false;

  constructor(private readonly db: DatabaseService) {}

  async getTracks(userId: string) {
    // Tracks belong to driver user accounts, not the fleet owner.
    // Resolve all linked driver user IDs first, then fetch their tracks.
    const driverRows = await this.db.db
      .select({ driverUserId: drivers.driverUserId, id: drivers.id, fullName: drivers.fullName })
      .from(drivers)
      .where(eq(drivers.ownerUserId, userId));

    const linked = driverRows.filter((d) => d.driverUserId);
    if (linked.length === 0) return [];

    const driverUserIds = linked.map((d) => d.driverUserId as string);
    const driverByUserId = new Map(linked.map((d) => [d.driverUserId!, d]));

    const rows = await this.db.db
      .select()
      .from(tracks)
      .where(inArray(tracks.userId, driverUserIds))
      .orderBy(desc(tracks.startTime));

    // Resolve vehicle names for all trips in one query.
    const vehicleIds = [...new Set(rows.map((t) => t.vehicleId).filter(Boolean))] as string[];
    const vehicleMap = new Map<string, string>();
    if (vehicleIds.length > 0) {
      const vehicleRows = await this.db.db
        .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, plate: vehicles.plate })
        .from(vehicles)
        .where(inArray(vehicles.id, vehicleIds));
      for (const v of vehicleRows) {
        const namePart = [v.make, v.model].filter(Boolean).join(' ');
        vehicleMap.set(v.id, namePart ? `${namePart} · ${v.plate}` : v.plate);
      }
    }

    const result = rows.map((t) => {
      const driver = driverByUserId.get(t.userId);
      const startGeo = t.startGeocode ? (() => { try { return JSON.parse(t.startGeocode!); } catch { return null; } })() : null;
      const endGeo   = t.endGeocode   ? (() => { try { return JSON.parse(t.endGeocode!);   } catch { return null; } })() : null;
      return {
        id: t.id,
        name: t.title,
        driverId: driver?.id ?? t.userId,
        driverName: driver?.fullName ?? 'Unknown',
        vehicleName: t.vehicleId ? vehicleMap.get(t.vehicleId) : undefined,
        distance: t.distance * 1000, // stored as km, frontend expects metres
        duration: t.durationSec,
        startTime: new Date(t.startTime).toISOString(),
        endTime: t.endTime ? new Date(t.endTime).toISOString() : null,
        status: t.status === 'active' ? 'in_progress' : t.status,
        startAddress: extractPlace(startGeo),
        endAddress: extractPlace(endGeo),
      };
    });

    // If any completed trips are missing geocodes (e.g. they synced after the
    // server started), kick off a background backfill so routes populate on
    // the next list refresh without blocking this response.
    const needsGeocode = rows.some((t) => {
      if (t.status !== 'completed') return false;
      if (!t.startGeocode || !t.endGeocode) return true;
      return (
        geocodeNeedsRefresh(parseGeocode(t.startGeocode)) ||
        geocodeNeedsRefresh(parseGeocode(t.endGeocode))
      );
    });
    if (needsGeocode) {
      void this.backfillGeocode().catch((e) =>
        this.logger.warn(`backfillGeocode failed: ${e instanceof Error ? e.message : e}`),
      );
      void this.refreshStaleGeocodes().catch((e) =>
        this.logger.warn(`refreshStaleGeocodes failed: ${e instanceof Error ? e.message : e}`),
      );
    }

    return result;
  }

  async getTracksWithPoints(userId: string) {
    const allTracks = await this.db.db
      .select()
      .from(tracks)
      .where(eq(tracks.userId, userId))
      .orderBy(desc(tracks.startTime));

    if (!allTracks.length) return [];

    const allPoints = await this.db.db
      .select({
        trackId: locationPoints.trackId,
        latitude: locationPoints.latitude,
        longitude: locationPoints.longitude,
        timestamp: locationPoints.timestamp,
      })
      .from(locationPoints)
      .where(eq(locationPoints.userId, userId))
      .orderBy(locationPoints.timestamp);

    const pointsByTrack = new Map<string, { latitude: number; longitude: number; timestamp: number }[]>();
    for (const point of allPoints) {
      if (!pointsByTrack.has(point.trackId))
        pointsByTrack.set(point.trackId, []);
      pointsByTrack.get(point.trackId)!.push({
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp,
      });
    }

    return allTracks.map(track => ({
      ...track,
      points: pointsByTrack.get(track.id) ?? [],
    }));
  }

  async getTrackWithPoints(userId: string, trackId: string) {
    const [track] = await this.db.db
      .select()
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    if (!track) throw new NotFoundException(`Track ${trackId} not found.`);

    // Tracks are owned by driver user accounts — verify through the drivers table.
    const [driver] = await this.db.db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        assignedVehicleId: drivers.assignedVehicleId,
      })
      .from(drivers)
      .where(and(eq(drivers.ownerUserId, userId), eq(drivers.driverUserId, track.userId)))
      .limit(1);

    if (!driver) throw new NotFoundException(`Track ${trackId} not found.`);

    const points = await this.db.db
      .select({
        lat: locationPoints.latitude,
        lng: locationPoints.longitude,
        timestamp: locationPoints.timestamp,
        speed: locationPoints.speed,
        elevation: locationPoints.altitude,
        accuracy: locationPoints.accuracy,
      })
      .from(locationPoints)
      .where(eq(locationPoints.trackId, trackId))
      .orderBy(locationPoints.timestamp);

    // Resolve vehicle name — prefer the vehicle logged on the trip itself,
    // fall back to whatever the driver currently has assigned.
    const vehicleIdToLookup = track.vehicleId ?? driver.assignedVehicleId;
    let vehicleName: string | undefined;
    if (vehicleIdToLookup) {
      const [veh] = await this.db.db
        .select({ make: vehicles.make, model: vehicles.model, plate: vehicles.plate })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleIdToLookup))
        .limit(1);
      if (veh) {
        vehicleName = [veh.make, veh.model].filter(Boolean).join(' ') || undefined;
        if (veh.plate) vehicleName = `${vehicleName ?? ''}${vehicleName ? ' · ' : ''}${veh.plate}`;
      }
    }

    const idleTime     = computeIdleTimeSec(points);
    const elevationGain = computeElevationGain(points.map((p) => ({ elevation: p.elevation ?? null })));
    const events       = deriveEvents(track.id, track.startTime, track.endTime, track.status, points);

    // Lazy geocode: fetch and cache start/end addresses the first time this trip is viewed.
    let startGeocodeJson = track.startGeocode ?? null;
    let endGeocodeJson   = track.endGeocode   ?? null;

    if (points.length > 0) {
      const startObj = parseGeocode(startGeocodeJson);
      if (!startGeocodeJson || geocodeNeedsRefresh(startObj)) {
        const geo = await geocodePoint(points[0].lat, points[0].lng);
        if (geo) {
          startGeocodeJson = JSON.stringify(geo);
          await this.db.query('UPDATE tracks SET start_geocode = $1 WHERE id = $2', [startGeocodeJson, track.id]).catch(() => {});
        }
      }

      const last = points[points.length - 1];
      const endObj = parseGeocode(endGeocodeJson);
      if (!endGeocodeJson || geocodeNeedsRefresh(endObj)) {
        const geo = await geocodePoint(last.lat, last.lng);
        if (geo) {
          endGeocodeJson = JSON.stringify(geo);
          await this.db.query('UPDATE tracks SET end_geocode = $1 WHERE id = $2', [endGeocodeJson, track.id]).catch(() => {});
        }
      }
    }

    const startGeocodeObj = parseGeocode(startGeocodeJson);
    const endGeocodeObj   = parseGeocode(endGeocodeJson);

    return {
      id: track.id,
      name: track.title,
      driverId: driver.id,
      driverName: driver.fullName,
      vehicleName,
      distance: track.distance * 1000, // km → metres
      duration: track.durationSec,
      startTime: new Date(track.startTime).toISOString(),
      endTime: track.endTime ? new Date(track.endTime).toISOString() : null,
      status: track.status === 'active' ? 'in_progress' : track.status,
      avgSpeed: track.avgSpeed,
      topSpeed: track.maxSpeed,
      idleTime,
      elevationGain,
      events,
      notes: (track as any).notes ?? null,
      startAddress: extractPlace(startGeocodeObj),
      endAddress: extractPlace(endGeocodeObj),
      points,
    };
  }

  async getPoints(_userId: string, trackId: string) {
    const rows = await this.db.db
      .select()
      .from(locationPoints)
      .where(eq(locationPoints.trackId, trackId))
      .orderBy(locationPoints.timestamp);
    return rows.map((p) => ({
      lat: p.latitude,
      lng: p.longitude,
      speed: p.speed ?? 0,
      elevation: p.altitude ?? 0,
      timestamp: p.timestamp,
      accuracy: p.accuracy ?? undefined,
    }));
  }

  async backfillGeocode() {
    if (!MAPBOX_TOKEN) return;
    if (this.geocodeRunning) return;
    this.geocodeRunning = true;

    type BackfillRow = {
      id: string;
      start_geocode: string | null;
      end_geocode: string | null;
      first_lat: number;
      first_lng: number;
      last_lat: number;
      last_lng: number;
    };

    try {
      // Find tracks that are missing at least one geocode and have location points.
      const rows = (await this.db.query(`
        SELECT
          t.id,
          t.start_geocode,
          t.end_geocode,
          first_pts.latitude  AS first_lat,
          first_pts.longitude AS first_lng,
          last_pts.latitude   AS last_lat,
          last_pts.longitude  AS last_lng
        FROM tracks t
        JOIN LATERAL (
          SELECT latitude, longitude FROM location_points
          WHERE track_id = t.id ORDER BY timestamp ASC LIMIT 1
        ) first_pts ON true
        JOIN LATERAL (
          SELECT latitude, longitude FROM location_points
          WHERE track_id = t.id ORDER BY timestamp DESC LIMIT 1
        ) last_pts ON true
        WHERE t.start_geocode IS NULL OR t.end_geocode IS NULL
      `)) as { rows: BackfillRow[] };

      if (rows.rows.length > 0) {
        this.logger.log(`[backfillGeocode] geocoding ${rows.rows.length} trip(s)`);
      }

      for (const row of rows.rows) {
        const startObj = parseGeocode(row.start_geocode);
        if (!row.start_geocode || geocodeNeedsRefresh(startObj)) {
          const geo = await geocodePoint(row.first_lat, row.first_lng);
          if (geo) {
            await this.db.query(
              'UPDATE tracks SET start_geocode = $1 WHERE id = $2',
              [JSON.stringify(geo), row.id],
            ).catch(() => {});
          }
        }

        const endObj = parseGeocode(row.end_geocode);
        if (!row.end_geocode || geocodeNeedsRefresh(endObj)) {
          const geo = await geocodePoint(row.last_lat, row.last_lng);
          if (geo) {
            await this.db.query(
              'UPDATE tracks SET end_geocode = $1 WHERE id = $2',
              [JSON.stringify(geo), row.id],
            ).catch(() => {});
          }
        }

        // Throttle: 5 requests/sec max (Mapbox free tier is generous but let's be nice).
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      this.geocodeRunning = false;
    }
  }

  /** Re-fetch Mapbox results that only have suburb-level features cached. */
  async refreshStaleGeocodes() {
    if (!MAPBOX_TOKEN) return;
    if (this.geocodeRunning) return;
    this.geocodeRunning = true;

    type BackfillRow = {
      id: string;
      start_geocode: string | null;
      end_geocode: string | null;
      first_lat: number;
      first_lng: number;
      last_lat: number;
      last_lng: number;
    };

    try {
      const rows = (await this.db.query(`
        SELECT
          t.id,
          t.start_geocode,
          t.end_geocode,
          first_pts.latitude  AS first_lat,
          first_pts.longitude AS first_lng,
          last_pts.latitude   AS last_lat,
          last_pts.longitude  AS last_lng
        FROM tracks t
        JOIN LATERAL (
          SELECT latitude, longitude FROM location_points
          WHERE track_id = t.id ORDER BY timestamp ASC LIMIT 1
        ) first_pts ON true
        JOIN LATERAL (
          SELECT latitude, longitude FROM location_points
          WHERE track_id = t.id ORDER BY timestamp DESC LIMIT 1
        ) last_pts ON true
        WHERE t.status = 'completed'
          AND (t.start_geocode IS NOT NULL OR t.end_geocode IS NOT NULL)
      `)) as { rows: BackfillRow[] };

      const stale = rows.rows.filter((row) =>
        geocodeNeedsRefresh(parseGeocode(row.start_geocode)) ||
        geocodeNeedsRefresh(parseGeocode(row.end_geocode)),
      );

      if (stale.length > 0) {
        this.logger.log(`[refreshStaleGeocodes] refreshing ${stale.length} trip(s)`);
      }

      for (const row of stale) {
        if (geocodeNeedsRefresh(parseGeocode(row.start_geocode))) {
          const geo = await geocodePoint(row.first_lat, row.first_lng);
          if (geo) {
            await this.db.query(
              'UPDATE tracks SET start_geocode = $1 WHERE id = $2',
              [JSON.stringify(geo), row.id],
            ).catch(() => {});
          }
        }

        if (geocodeNeedsRefresh(parseGeocode(row.end_geocode))) {
          const geo = await geocodePoint(row.last_lat, row.last_lng);
          if (geo) {
            await this.db.query(
              'UPDATE tracks SET end_geocode = $1 WHERE id = $2',
              [JSON.stringify(geo), row.id],
            ).catch(() => {});
          }
        }

        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      this.geocodeRunning = false;
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { tracks, locationPoints, drivers, vehicles } from '../database/schema';

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

    return rows.map((t) => {
      const driver = driverByUserId.get(t.userId);
      return {
        id: t.id,
        name: t.title,
        driverId: driver?.id ?? t.userId,
        driverName: driver?.fullName ?? 'Unknown',
        distance: t.distance * 1000, // stored as km, frontend expects metres
        duration: t.durationSec,
        startTime: new Date(t.startTime).toISOString(),
        endTime: t.endTime ? new Date(t.endTime).toISOString() : null,
        status: t.status === 'active' ? 'in_progress' : t.status,
      };
    });
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

    // Resolve assigned vehicle name.
    let vehicleName: string | undefined;
    if (driver.assignedVehicleId) {
      const [veh] = await this.db.db
        .select({ make: vehicles.make, model: vehicles.model, plate: vehicles.plate })
        .from(vehicles)
        .where(eq(vehicles.id, driver.assignedVehicleId))
        .limit(1);
      if (veh) {
        vehicleName = [veh.make, veh.model].filter(Boolean).join(' ') || undefined;
        if (veh.plate) vehicleName = `${vehicleName ?? ''}${vehicleName ? ' · ' : ''}${veh.plate}`;
      }
    }

    const idleTime     = computeIdleTimeSec(points);
    const elevationGain = computeElevationGain(points.map((p) => ({ elevation: p.elevation ?? null })));
    const events       = deriveEvents(track.id, track.startTime, track.endTime, track.status, points);

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
}

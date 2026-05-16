import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { tracks, locationPoints, drivers } from '../database/schema';

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
        distance: t.distance,
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

    if (!track || track.userId !== userId) throw new NotFoundException(`Track ${trackId} not found.`);

    const points = await this.db.db
      .select({
        latitude: locationPoints.latitude,
        longitude: locationPoints.longitude,
        timestamp: locationPoints.timestamp,
        speed: locationPoints.speed,
        altitude: locationPoints.altitude,
      })
      .from(locationPoints)
      .where(eq(locationPoints.trackId, trackId))
      .orderBy(locationPoints.timestamp);

    return { ...track, points };
  }

  async getPoints(_userId: string, trackId: string) {
    return this.db.db
      .select()
      .from(locationPoints)
      .where(eq(locationPoints.trackId, trackId))
      .orderBy(locationPoints.timestamp);
  }
}

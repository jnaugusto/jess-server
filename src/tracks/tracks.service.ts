import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { tracks, locationPoints } from '../database/schema';

@Injectable()
export class TracksService {
  constructor(private readonly db: DatabaseService) {}

  async getTracks(userId: string) {
    return this.db.db
      .select()
      .from(tracks)
      .where(eq(tracks.userId, userId))
      .orderBy(desc(tracks.startTime));
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

import { Injectable } from '@nestjs/common';
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

  async getPoints(userId: string, trackId: string) {
    return this.db.db
      .select()
      .from(locationPoints)
      .where(eq(locationPoints.trackId, trackId))
      .orderBy(locationPoints.timestamp);
  }
}

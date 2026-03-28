import { Injectable } from '@nestjs/common';
import { and, between, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { locations, users } from '../database/schema';

@Injectable()
export class LocationsService {
  constructor(private readonly db: DatabaseService) {}

  async getLocations(userId: string, deviceId: string, from: number, to: number) {
    return this.db.db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.userId, userId),
          eq(locations.deviceId, deviceId),
          between(locations.timestamp, String(from), String(to)),
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
}

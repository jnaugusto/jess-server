import { Injectable } from '@nestjs/common';
import { and, between, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { locationsOld as locations } from '../database/schema.old';
import { GetLocationsDto } from './dto/get-locations.dto';

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
}

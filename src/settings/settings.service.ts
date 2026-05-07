import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { userSettings } from '../database/schema';

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}

  async get(userId: string) {
    const [existing] = await this.db.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (existing) return existing;

    const [created] = await this.db.db
      .insert(userSettings)
      .values({ userId })
      .returning();
    return created;
  }

  async update(userId: string, dto: Record<string, unknown>) {
    await this.get(userId);

    const [updated] = await this.db.db
      .update(userSettings)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    return updated;
  }
}

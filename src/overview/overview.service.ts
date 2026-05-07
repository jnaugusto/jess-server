import { Injectable } from '@nestjs/common';
import { eq, and, gte, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, vehicles, tracks } from '../database/schema';

@Injectable()
export class OverviewService {
  constructor(private readonly db: DatabaseService) {}

  async getOverview(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTodayMs = startOfToday.getTime();

    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoMs = sevenDaysAgo.getTime();

    const [
      allDrivers,
      vehicleList,
      todayTrips,
      weekTrips,
    ] = await Promise.all([
      this.db.db
        .select()
        .from(drivers)
        .where(eq(drivers.ownerUserId, userId)),
      this.db.db
        .select()
        .from(vehicles)
        .where(eq(vehicles.ownerUserId, userId)),
      this.db.db
        .select()
        .from(tracks)
        .where(and(eq(tracks.userId, userId), gte(tracks.startTime, startOfTodayMs)))
        .orderBy(desc(tracks.startTime)),
      this.db.db
        .select()
        .from(tracks)
        .where(and(eq(tracks.userId, userId), gte(tracks.startTime, sevenDaysAgoMs)))
        .orderBy(desc(tracks.startTime)),
    ]);

    const activeDrivers = allDrivers.filter((d) => d.status === 'active');
    const distanceTodayKm = todayTrips.reduce((sum, t) => sum + t.distance, 0);

    const distanceWeekly: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const dayDistance = weekTrips
        .filter((t) => t.startTime >= dayStart && t.startTime < dayEnd)
        .reduce((sum, t) => sum + t.distance, 0);
      distanceWeekly.push(Math.round(dayDistance * 100) / 100);
    }

    const vehicleStatus = {
      inUse: vehicleList.filter((v) => v.status === 'in_use').length,
      available: vehicleList.filter((v) => v.status === 'available').length,
      maintenance: vehicleList.filter((v) => v.status === 'maintenance').length,
    };

    const recentTrips = todayTrips.slice(0, 10).map((t) => ({
      id: t.id,
      driverName: '',
      driverInitials: '',
      vehicleCode: '',
      vehiclePlate: '',
      startTime: t.startTime,
      distance: t.distance,
      durationSec: t.durationSec,
      maxSpeed: t.maxSpeed,
      status: t.status,
    }));

    const activeDriversList = activeDrivers.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      code: d.code,
      status: 'idle' as const,
      speedKmh: null,
      heading: null,
    }));

    return {
      kpis: {
        activeDrivers: {
          value: activeDrivers.length,
          total: allDrivers.length,
          deltaSinceYesterday: 0,
        },
        distanceTodayKm: Math.round(distanceTodayKm * 100) / 100,
        distanceWeekly,
        tripsCompletedToday: todayTrips.length,
        tripsTrendPct: 0,
        avgAccuracyM: 0,
        accuracyDeltaM: 0,
      },
      activeDrivers: activeDriversList,
      recentTrips,
      vehicleStatus,
    };
  }
}

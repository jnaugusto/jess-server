import { Injectable } from '@nestjs/common';
import { eq, and, gte, desc, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, vehicles, tracks, locationPoints } from '../database/schema';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function mapTripStatus(
  status: string,
): 'in_progress' | 'completed' | 'paused' {
  if (status === 'active') return 'in_progress';
  if (status === 'paused') return 'paused';
  return 'completed';
}

@Injectable()
export class OverviewService {
  constructor(private readonly db: DatabaseService) {}

  async getOverview(userId: string) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfTodayMs = startOfToday.getTime();
    const sevenDaysAgoMs = startOfTodayMs - 7 * 24 * 60 * 60 * 1000;

    const allDrivers = await this.db.db
      .select()
      .from(drivers)
      .where(eq(drivers.ownerUserId, userId));

    const driverUserIds = allDrivers
      .map((d) => d.driverUserId)
      .filter((v): v is string => !!v);

    // Tracks belong to driver accounts (and legacy owner-recorded trips).
    const trackOwnerIds = Array.from(new Set([userId, ...driverUserIds]));
    const driverByUserId = new Map(
      allDrivers
        .filter((d) => !!d.driverUserId)
        .map((d) => [d.driverUserId as string, d]),
    );
    const driverById = new Map(allDrivers.map((d) => [d.id, d]));
    const trackOwnerCondition = inArray(tracks.userId, trackOwnerIds);

    const [vehicleList, todayTrips, weekTrips, recentTripsRows, accuracyRow] =
      await Promise.all([
        this.db.db
          .select()
          .from(vehicles)
          .where(eq(vehicles.ownerUserId, userId)),
        this.db.db
          .select()
          .from(tracks)
          .where(
            and(trackOwnerCondition, gte(tracks.startTime, startOfTodayMs)),
          )
          .orderBy(desc(tracks.startTime)),
        this.db.db
          .select()
          .from(tracks)
          .where(
            and(trackOwnerCondition, gte(tracks.startTime, sevenDaysAgoMs)),
          )
          .orderBy(desc(tracks.startTime)),
        this.db.db
          .select()
          .from(tracks)
          .where(trackOwnerCondition)
          .orderBy(desc(tracks.startTime))
          .limit(10),
        this.db.db
          .select({
            avg: sql<number>`COALESCE(AVG(${locationPoints.accuracy}), 0)::float8`,
          })
          .from(locationPoints)
          .where(
            and(
              inArray(locationPoints.userId, trackOwnerIds),
              gte(locationPoints.timestamp, startOfTodayMs),
            ),
          )
          .then((r) => r[0]),
      ]);

    const vehicleMap = new Map(vehicleList.map((v) => [v.id, v]));

    const activeDrivers = allDrivers.filter(
      (d) => d.status === 'active' || d.status === 'on_trip',
    );

    const distanceTodayKm = todayTrips.reduce((sum, t) => sum + t.distance, 0);
    const tripsCompletedToday = todayTrips.filter(
      (t) => t.status === 'completed',
    ).length;

    const distanceWeekly: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfTodayMs - i * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const dayDistance = weekTrips
        .filter((t) => t.startTime >= dayStart && t.startTime < dayEnd)
        .reduce((sum, t) => sum + t.distance, 0);
      distanceWeekly.push(Math.round(dayDistance * 100) / 100);
    }

    const vehicleStatus = {
      inUse: vehicleList.filter((v) => v.status === 'in_use').length,
      available: vehicleList.filter((v) => v.status === 'available').length,
      maintenance: vehicleList.filter((v) => v.status === 'maintenance')
        .length,
    };

    const mapRecentTrip = (t: (typeof recentTripsRows)[number]) => {
      const driver =
        (t.driverId ? driverById.get(t.driverId) : undefined) ??
        driverByUserId.get(t.userId);
      const vehicle = t.vehicleId ? vehicleMap.get(t.vehicleId) : undefined;
      const driverName = driver?.fullName ?? 'Unknown';
      const maxSpeedKmh =
        t.maxSpeed > 0 ? Math.round(t.maxSpeed * 3.6) : null;

      return {
        id: t.id,
        driverName,
        driverInitials: initials(driverName),
        vehicleCode: vehicle?.code ?? vehicle?.plate ?? '',
        vehiclePlate: vehicle?.plate ?? '',
        startTime: t.startTime,
        distance: t.distance * 1000,
        durationSec: Number(t.durationSec),
        maxSpeed: maxSpeedKmh,
        status: mapTripStatus(t.status),
      };
    };

    const recentTrips = recentTripsRows.map(mapRecentTrip);

    const activeDriversList = activeDrivers.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      code: d.code,
      status:
        d.status === 'on_trip' ? ('on_trip' as const) : ('active' as const),
      speedKmh: null,
      heading: null,
    }));

    const avgAccuracyM = Math.round(Number(accuracyRow?.avg ?? 0) * 10) / 10;

    return {
      kpis: {
        activeDrivers: {
          value: activeDrivers.length,
          total: allDrivers.length,
          deltaSinceYesterday: 0,
        },
        distanceTodayKm: Math.round(distanceTodayKm * 100) / 100,
        distanceWeekly,
        tripsCompletedToday,
        tripsTrendPct: 0,
        avgAccuracyM,
        accuracyDeltaM: 0,
      },
      activeDrivers: activeDriversList,
      recentTrips,
      vehicleStatus,
    };
  }
}

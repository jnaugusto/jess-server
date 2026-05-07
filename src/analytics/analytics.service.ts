import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, locationPoints, tracks } from '../database/schema';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'ytd';

export interface AnalyticsKpi {
  label: string;
  value: number;
  unit: string;
  deltaPct?: number;
  deltaTone?: 'ok' | 'warn' | 'danger';
  deltaText?: string;
  spark?: number[];
}

export interface AnalyticsLeader {
  driverId: string;
  fullName: string;
  code: string;
  trips: number;
  distanceKm: number;
  deltaPct: number;
}

export interface AnalyticsCorridor {
  name: string;
  avgKm: number;
  trips: number;
  utilizationPct: number;
}

export interface AnalyticsHeatmapRow {
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  cells: number[];
}

export interface AnalyticsSpeedBucket {
  range: string;
  pct: number;
  tone: 'ok' | 'accent' | 'warn' | 'danger';
}

export interface AnalyticsTimeSeriesPoint {
  date: string;
  distanceKm: number;
  trips: number;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  kpis: {
    totalDistanceKm: AnalyticsKpi;
    tripsCompleted: AnalyticsKpi;
    avgDurationMin: AnalyticsKpi;
    fleetUtilizationPct: AnalyticsKpi;
  };
  series: AnalyticsTimeSeriesPoint[];
  leaderboard: AnalyticsLeader[];
  corridors: AnalyticsCorridor[];
  heatmap: AnalyticsHeatmapRow[];
  speedDistribution: AnalyticsSpeedBucket[];
  overspeedEvents: { count: number; detail: string };
  idle: {
    drivingPct: number;
    drivingHours: number;
    idleHours: number;
    drivingDeltaHours: number;
    idleDeltaHours: number;
    idleNote?: string;
  };
  dataQuality: {
    avgAccuracyM: number;
    accuracyDeltaM: number;
    uploadSuccessPct: number;
    uploadDeltaPct: number;
    avgSyncLagSec: number;
    devicesOffline24hPlus: number;
  };
}

const ALLOWED_RANGES: ReadonlySet<AnalyticsRange> = new Set<AnalyticsRange>([
  '7d',
  '30d',
  '90d',
  'ytd',
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_SPEED_KMH = 90;
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function normaliseRange(input?: string): AnalyticsRange {
  if (input && ALLOWED_RANGES.has(input as AnalyticsRange)) {
    return input as AnalyticsRange;
  }
  return '30d';
}

function rangeWindow(range: AnalyticsRange, now: number) {
  let startMs: number;
  let prevStartMs: number;
  let prevEndMs: number;

  if (range === 'ytd') {
    const yearStart = new Date(now);
    yearStart.setMonth(0, 1);
    yearStart.setHours(0, 0, 0, 0);
    startMs = yearStart.getTime();
    const lastYearStart = new Date(yearStart);
    lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
    prevStartMs = lastYearStart.getTime();
    prevEndMs = startMs;
  } else {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    startMs = now - days * DAY_MS;
    prevEndMs = startMs;
    prevStartMs = startMs - days * DAY_MS;
  }
  return { startMs, endMs: now, prevStartMs, prevEndMs };
}

function bucketStrategy(
  range: AnalyticsRange,
): { bucketCount: number; bucketUnit: 'day' | 'week' | 'month' } {
  switch (range) {
    case '7d':
      return { bucketCount: 7, bucketUnit: 'day' };
    case '30d':
      return { bucketCount: 30, bucketUnit: 'day' };
    case '90d':
      return { bucketCount: 13, bucketUnit: 'week' };
    case 'ytd':
      return { bucketCount: 12, bucketUnit: 'month' };
  }
}

function deltaPct(curr: number, prev: number): number | undefined {
  if (prev <= 0) return curr > 0 ? 100 : undefined;
  return Math.round(((curr - prev) / prev) * 100);
}

function deltaTone(
  curr: number,
  prev: number,
  higherIsBetter = true,
): 'ok' | 'warn' | 'danger' | undefined {
  if (prev <= 0 && curr <= 0) return undefined;
  const dir = higherIsBetter
    ? curr - prev
    : prev - curr;
  if (dir > 0) return 'ok';
  if (dir === 0) return undefined;
  const ratio = prev > 0 ? Math.abs((curr - prev) / prev) : 1;
  return ratio > 0.1 ? 'danger' : 'warn';
}

function bucketLabel(unit: 'day' | 'week' | 'month', d: Date): string {
  if (unit === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  }
  return d
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    .toUpperCase();
}

function bucketStart(unit: 'day' | 'week' | 'month', i: number, anchor: Date) {
  const d = new Date(anchor);
  if (unit === 'day') d.setDate(d.getDate() + i);
  else if (unit === 'week') d.setDate(d.getDate() + i * 7);
  else d.setMonth(d.getMonth() + i, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getAnalytics(
    workspaceUserId: string,
    rangeInput?: string,
  ): Promise<AnalyticsData> {
    const range = normaliseRange(rangeInput);
    const now = Date.now();
    const { startMs, endMs, prevStartMs, prevEndMs } = rangeWindow(range, now);

    const driverRows = await this.db.db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        code: drivers.code,
        driverUserId: drivers.driverUserId,
      })
      .from(drivers)
      .where(eq(drivers.ownerUserId, workspaceUserId));

    const driverUserIds = driverRows
      .map((d) => d.driverUserId)
      .filter((v): v is string => !!v);
    const trackOwnerIds = Array.from(
      new Set([workspaceUserId, ...driverUserIds]),
    );
    const driverByUserId = new Map(
      driverRows
        .filter((d) => !!d.driverUserId)
        .map((d) => [d.driverUserId as string, d]),
    );

    const trackOwnerCondition = inArray(tracks.userId, trackOwnerIds);

    const [
      currentAgg,
      previousAgg,
      perBucket,
      leaderRows,
      heatmapRows,
      speedRows,
      overspeedRow,
      accuracyRow,
      lastTrackPerDriver,
    ] = await Promise.all([
      // Current-window aggregates
      this.db.db
        .select({
          distance: sql<number>`COALESCE(SUM(${tracks.distance}), 0)::float8`,
          trips: sql<number>`COUNT(*)::int`,
          totalDuration: sql<number>`COALESCE(SUM(${tracks.durationSec}), 0)::float8`,
          activeDays: sql<number>`COUNT(DISTINCT (${tracks.startTime} / 86400000))::int`,
        })
        .from(tracks)
        .where(
          and(
            trackOwnerCondition,
            gte(tracks.startTime, startMs),
            lt(tracks.startTime, endMs),
          ),
        )
        .then((r) => r[0]),

      // Previous-window aggregates (for deltas)
      this.db.db
        .select({
          distance: sql<number>`COALESCE(SUM(${tracks.distance}), 0)::float8`,
          trips: sql<number>`COUNT(*)::int`,
          totalDuration: sql<number>`COALESCE(SUM(${tracks.durationSec}), 0)::float8`,
          activeDays: sql<number>`COUNT(DISTINCT (${tracks.startTime} / 86400000))::int`,
        })
        .from(tracks)
        .where(
          and(
            trackOwnerCondition,
            gte(tracks.startTime, prevStartMs),
            lt(tracks.startTime, prevEndMs),
          ),
        )
        .then((r) => r[0]),

      // Per-day buckets — let JS aggregate into the right bucket size
      this.db.db
        .select({
          dayMs: sql<number>`(FLOOR(${tracks.startTime} / 86400000) * 86400000)::float8`,
          distance: sql<number>`COALESCE(SUM(${tracks.distance}), 0)::float8`,
          trips: sql<number>`COUNT(*)::int`,
        })
        .from(tracks)
        .where(
          and(
            trackOwnerCondition,
            gte(tracks.startTime, startMs),
            lt(tracks.startTime, endMs),
          ),
        )
        .groupBy(sql`FLOOR(${tracks.startTime} / 86400000)`),

      // Leaderboard: per driver_user_id
      driverUserIds.length
        ? this.db.db
            .select({
              userId: tracks.userId,
              distance: sql<number>`COALESCE(SUM(${tracks.distance}), 0)::float8`,
              trips: sql<number>`COUNT(*)::int`,
            })
            .from(tracks)
            .where(
              and(
                inArray(tracks.userId, driverUserIds),
                gte(tracks.startTime, startMs),
                lt(tracks.startTime, endMs),
              ),
            )
            .groupBy(tracks.userId)
        : Promise.resolve(
            [] as { userId: string; distance: number; trips: number }[],
          ),

      // Heatmap: trips by weekday × hour (PG dow: 0=Sun..6=Sat)
      this.db.db
        .select({
          dow: sql<number>`EXTRACT(DOW FROM TO_TIMESTAMP(${tracks.startTime} / 1000.0))::int`,
          hour: sql<number>`EXTRACT(HOUR FROM TO_TIMESTAMP(${tracks.startTime} / 1000.0))::int`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(tracks)
        .where(
          and(
            trackOwnerCondition,
            gte(tracks.startTime, startMs),
            lt(tracks.startTime, endMs),
          ),
        )
        .groupBy(
          sql`EXTRACT(DOW FROM TO_TIMESTAMP(${tracks.startTime} / 1000.0))`,
          sql`EXTRACT(HOUR FROM TO_TIMESTAMP(${tracks.startTime} / 1000.0))`,
        ),

      // Speed distribution from location_points (m/s → km/h via *3.6)
      this.db.db
        .select({
          bucket: sql<string>`
            CASE
              WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 30 THEN '0-30'
              WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 60 THEN '30-60'
              WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 90 THEN '60-90'
              ELSE '90+'
            END
          `,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(locationPoints)
        .where(
          and(
            inArray(locationPoints.userId, trackOwnerIds),
            gte(locationPoints.timestamp, startMs),
            lt(locationPoints.timestamp, endMs),
          ),
        )
        .groupBy(sql`
          CASE
            WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 30 THEN '0-30'
            WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 60 THEN '30-60'
            WHEN COALESCE(${locationPoints.speed}, 0) * 3.6 < 90 THEN '60-90'
            ELSE '90+'
          END
        `),

      // Overspeed events: tracks whose maxSpeed crossed the alert threshold
      this.db.db
        .select({
          count: sql<number>`COUNT(*)::int`,
        })
        .from(tracks)
        .where(
          and(
            trackOwnerCondition,
            gte(tracks.startTime, startMs),
            lt(tracks.startTime, endMs),
            sql`${tracks.maxSpeed} * 3.6 >= ${ALERT_SPEED_KMH}`,
          ),
        )
        .then((r) => r[0]),

      // Avg GPS accuracy
      this.db.db
        .select({
          avg: sql<number>`COALESCE(AVG(${locationPoints.accuracy}), 0)::float8`,
        })
        .from(locationPoints)
        .where(
          and(
            inArray(locationPoints.userId, trackOwnerIds),
            gte(locationPoints.timestamp, startMs),
            lt(locationPoints.timestamp, endMs),
          ),
        )
        .then((r) => r[0]),

      // For "devices offline 24h+" — last track per driver_user_id
      driverUserIds.length
        ? this.db.db
            .select({
              userId: tracks.userId,
              lastStart: sql<number>`MAX(${tracks.startTime})::float8`,
            })
            .from(tracks)
            .where(inArray(tracks.userId, driverUserIds))
            .groupBy(tracks.userId)
        : Promise.resolve([] as { userId: string; lastStart: number }[]),
    ]);

    const distanceKmCurrent = Number(currentAgg?.distance ?? 0);
    const distanceKmPrev = Number(previousAgg?.distance ?? 0);
    const tripsCurrent = Number(currentAgg?.trips ?? 0);
    const tripsPrev = Number(previousAgg?.trips ?? 0);
    const avgDurationMinCurrent =
      tripsCurrent > 0 ? Number(currentAgg?.totalDuration ?? 0) / tripsCurrent / 60 : 0;
    const avgDurationMinPrev =
      tripsPrev > 0 ? Number(previousAgg?.totalDuration ?? 0) / tripsPrev / 60 : 0;

    const totalRangeDays = Math.max(
      1,
      Math.round((endMs - startMs) / DAY_MS),
    );
    const fleetUtilizationCurr =
      Number(currentAgg?.activeDays ?? 0) / totalRangeDays * 100;
    const totalPrevDays = Math.max(
      1,
      Math.round((prevEndMs - prevStartMs) / DAY_MS),
    );
    const fleetUtilizationPrev =
      Number(previousAgg?.activeDays ?? 0) / totalPrevDays * 100;

    // Build series buckets
    const { bucketCount, bucketUnit } = bucketStrategy(range);
    const anchor = new Date(startMs);
    if (bucketUnit === 'day') anchor.setHours(0, 0, 0, 0);
    if (bucketUnit === 'week') {
      anchor.setHours(0, 0, 0, 0);
      const dow = anchor.getDay();
      anchor.setDate(anchor.getDate() - dow);
    }
    if (bucketUnit === 'month') {
      anchor.setDate(1);
      anchor.setHours(0, 0, 0, 0);
    }

    const buckets: { date: string; distanceKm: number; trips: number; startMs: number; endMs: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bs = bucketStart(bucketUnit, i, anchor);
      const be = bucketStart(bucketUnit, i + 1, anchor);
      buckets.push({
        date: bucketLabel(bucketUnit, bs),
        distanceKm: 0,
        trips: 0,
        startMs: bs.getTime(),
        endMs: be.getTime(),
      });
    }

    for (const row of perBucket) {
      const ms = Number(row.dayMs);
      const idx = buckets.findIndex(
        (b) => ms >= b.startMs && ms < b.endMs,
      );
      if (idx >= 0) {
        buckets[idx].distanceKm += Number(row.distance);
        buckets[idx].trips += Number(row.trips);
      }
    }
    const series: AnalyticsTimeSeriesPoint[] = buckets.map((b) => ({
      date: b.date,
      distanceKm: Math.round(b.distanceKm * 10) / 10,
      trips: b.trips,
    }));

    // Sparks for KPIs (mirror series shape)
    const sparkDistance = series.map((p) => p.distanceKm);
    const sparkTrips = series.map((p) => p.trips);

    // Leaderboard with per-driver previous-period delta
    const prevLeaderRows = driverUserIds.length
      ? await this.db.db
          .select({
            userId: tracks.userId,
            distance: sql<number>`COALESCE(SUM(${tracks.distance}), 0)::float8`,
          })
          .from(tracks)
          .where(
            and(
              inArray(tracks.userId, driverUserIds),
              gte(tracks.startTime, prevStartMs),
              lt(tracks.startTime, prevEndMs),
            ),
          )
          .groupBy(tracks.userId)
      : [];
    const prevByUser = new Map(
      prevLeaderRows.map((r) => [r.userId, Number(r.distance)]),
    );
    const leaderboard: AnalyticsLeader[] = leaderRows
      .map((r) => {
        const driver = driverByUserId.get(r.userId);
        if (!driver) return null;
        const distanceKm = Math.round(Number(r.distance) * 10) / 10;
        const prevKm = prevByUser.get(r.userId) ?? 0;
        const dPct = deltaPct(distanceKm, prevKm) ?? 0;
        return {
          driverId: driver.id,
          fullName: driver.fullName,
          code: driver.code,
          trips: Number(r.trips),
          distanceKm,
          deltaPct: dPct,
        } satisfies AnalyticsLeader;
      })
      .filter((v): v is AnalyticsLeader => v !== null)
      .sort((a, b) => b.distanceKm - a.distanceKm)
      .slice(0, 10);

    // Heatmap (Mon-first)
    const heatmap: AnalyticsHeatmapRow[] = [
      'MON',
      'TUE',
      'WED',
      'THU',
      'FRI',
      'SAT',
      'SUN',
    ].map((day) => ({
      day: day as AnalyticsHeatmapRow['day'],
      cells: Array(24).fill(0) as number[],
    }));
    for (const r of heatmapRows) {
      const label = DAY_LABELS[Number(r.dow)];
      const row = heatmap.find((h) => h.day === label);
      if (row) {
        const hour = Math.max(0, Math.min(23, Number(r.hour)));
        row.cells[hour] = Number(r.count);
      }
    }

    // Speed distribution
    const speedTotal = speedRows.reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    const bucketPct = (label: string) => {
      if (speedTotal === 0) return 0;
      const found = speedRows.find((r) => r.bucket === label);
      return Math.round(((Number(found?.count ?? 0)) / speedTotal) * 100);
    };
    const speedDistribution: AnalyticsSpeedBucket[] = [
      { range: '0–30', pct: bucketPct('0-30'), tone: 'ok' },
      { range: '30–60', pct: bucketPct('30-60'), tone: 'accent' },
      { range: '60–90', pct: bucketPct('60-90'), tone: 'warn' },
      { range: '90+', pct: bucketPct('90+'), tone: 'danger' },
    ];

    const overspeedCount = Number(overspeedRow?.count ?? 0);

    // dataQuality
    const avgAccuracyM = Math.round(Number(accuracyRow?.avg ?? 0) * 10) / 10;
    const offline24hCutoff = now - DAY_MS;
    const lastByUser = new Map(
      lastTrackPerDriver.map((r) => [r.userId, Number(r.lastStart)]),
    );
    const devicesOffline24hPlus = driverRows.filter((d) => {
      if (!d.driverUserId) return true;
      const last = lastByUser.get(d.driverUserId) ?? 0;
      return last < offline24hCutoff;
    }).length;

    // idle (driving derived from trips; idle/upload metrics stubbed for now)
    const drivingHours =
      Math.round((Number(currentAgg?.totalDuration ?? 0) / 3600) * 10) / 10;
    const drivingHoursPrev =
      Math.round((Number(previousAgg?.totalDuration ?? 0) / 3600) * 10) / 10;

    return {
      range,
      kpis: {
        totalDistanceKm: {
          label: 'Total distance',
          value: Math.round(distanceKmCurrent * 10) / 10,
          unit: 'km',
          deltaPct: deltaPct(distanceKmCurrent, distanceKmPrev),
          deltaTone: deltaTone(distanceKmCurrent, distanceKmPrev, true),
          spark: sparkDistance,
        },
        tripsCompleted: {
          label: 'Trips completed',
          value: tripsCurrent,
          unit: '',
          deltaPct: deltaPct(tripsCurrent, tripsPrev),
          deltaTone: deltaTone(tripsCurrent, tripsPrev, true),
          spark: sparkTrips,
        },
        avgDurationMin: {
          label: 'Avg trip duration',
          value: Math.round(avgDurationMinCurrent * 10) / 10,
          unit: 'min',
          deltaPct: deltaPct(avgDurationMinCurrent, avgDurationMinPrev),
          deltaTone: deltaTone(
            avgDurationMinCurrent,
            avgDurationMinPrev,
            false,
          ),
          spark: sparkTrips.map((_, i, arr) =>
            arr.length > 0
              ? Math.round(
                  ((sparkDistance[i] ?? 0) / Math.max(1, sparkTrips[i] ?? 1)) *
                    10,
                ) / 10
              : 0,
          ),
        },
        fleetUtilizationPct: {
          label: 'Fleet utilization',
          value: Math.round(fleetUtilizationCurr),
          unit: '%',
          deltaPct: deltaPct(fleetUtilizationCurr, fleetUtilizationPrev),
          deltaTone: deltaTone(
            fleetUtilizationCurr,
            fleetUtilizationPrev,
            true,
          ),
          spark: series.map((p) => (p.trips > 0 ? 1 : 0)),
        },
      },
      series,
      leaderboard,
      corridors: [],
      heatmap,
      speedDistribution,
      overspeedEvents: {
        count: overspeedCount,
        detail:
          overspeedCount === 0
            ? 'No overspeed events recorded.'
            : `${overspeedCount} trip${overspeedCount === 1 ? '' : 's'} crossed ${ALERT_SPEED_KMH} km/h.`,
      },
      idle: {
        drivingPct:
          drivingHours + 0 > 0
            ? Math.round((drivingHours / (drivingHours + 0)) * 100)
            : 0,
        drivingHours,
        idleHours: 0,
        drivingDeltaHours:
          Math.round((drivingHours - drivingHoursPrev) * 10) / 10,
        idleDeltaHours: 0,
        idleNote: 'Idle accounting will populate once stop detection lands.',
      },
      dataQuality: {
        avgAccuracyM,
        accuracyDeltaM: 0,
        uploadSuccessPct: 0,
        uploadDeltaPct: 0,
        avgSyncLagSec: 0,
        devicesOffline24hPlus,
      },
    };
  }
}

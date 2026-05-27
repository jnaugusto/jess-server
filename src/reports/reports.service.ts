import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { Readable } from 'stream';
import { extractPlace } from '../common/geocode/extract-place';
import { DatabaseService } from '../database/database.service';
import { drivers, tracks, userSettings, vehicles } from '../database/schema';
import { TracksService } from '../tracks/tracks.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type DateWindow = {
  startMs: number;
  endMs: number;
  label: string;
};

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cols: unknown[]) {
  return cols.map(csvEscape).join(',') + '\n';
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '0:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function msToKmh(ms: number | null | undefined): string {
  if (ms == null) return '';
  return (ms * 3.6).toFixed(1);
}

function parseIsoDate(input: string, endOfDay = false): number {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${input}`);
  }
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function windowFromQuery(from?: string, to?: string, range?: string): DateWindow {
  const now = Date.now();

  if (from && to) {
    const startMs = parseIsoDate(from, false);
    const endMs = parseIsoDate(to, true);
    if (endMs < startMs) {
      throw new BadRequestException('`to` must be on or after `from`.');
    }
    return { startMs, endMs, label: `${from} to ${to}` };
  }

  const preset = range ?? '30d';
  let startMs: number;
  let label: string;

  if (preset === '7d') {
    startMs = now - 7 * DAY_MS;
    label = 'Last 7 days';
  } else if (preset === '90d') {
    startMs = now - 90 * DAY_MS;
    label = 'Last 90 days';
  } else if (preset === 'ytd') {
    const yearStart = new Date(now);
    yearStart.setMonth(0, 1);
    yearStart.setHours(0, 0, 0, 0);
    startMs = yearStart.getTime();
    label = `Year to date (${yearStart.getFullYear()})`;
  } else {
    startMs = now - 30 * DAY_MS;
    label = 'Last 30 days';
  }

  return { startMs, endMs: now, label };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tracksService: TracksService,
  ) {}

  private async resolveFleetContext(ownerUserId: string) {
    const [settings] = await this.db.db
      .select({ orgName: userSettings.orgName, timezone: userSettings.timezone })
      .from(userSettings)
      .where(eq(userSettings.userId, ownerUserId))
      .limit(1);

    const driverRows = await this.db.db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        driverUserId: drivers.driverUserId,
      })
      .from(drivers)
      .where(eq(drivers.ownerUserId, ownerUserId));

    const linked = driverRows.filter((d) => d.driverUserId);
    const driverUserIds = linked.map((d) => d.driverUserId as string);
    const driverByUserId = new Map(linked.map((d) => [d.driverUserId!, d]));

    return {
      orgName: settings?.orgName ?? 'Fleet',
      timezone: settings?.timezone ?? 'Asia/Manila',
      driverUserIds,
      driverByUserId,
    };
  }

  async buildSummaryCsv(
    ownerUserId: string,
    from?: string,
    to?: string,
    range?: string,
  ): Promise<{ filename: string; content: string }> {
    const window = windowFromQuery(from, to, range);
    const { orgName, driverUserIds, driverByUserId } = await this.resolveFleetContext(ownerUserId);

    if (driverUserIds.length === 0) {
      throw new NotFoundException('No drivers linked to this fleet.');
    }

    const rows = await this.db.db
      .select()
      .from(tracks)
      .where(
        and(
          inArray(tracks.userId, driverUserIds),
          gte(tracks.startTime, window.startMs),
          lt(tracks.startTime, window.endMs),
        ),
      )
      .orderBy(desc(tracks.startTime));

    const vehicleIds = [...new Set(rows.map((t) => t.vehicleId).filter(Boolean))] as string[];
    const vehicleMap = new Map<string, string>();
    if (vehicleIds.length > 0) {
      const vehicleRows = await this.db.db
        .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, plate: vehicles.plate })
        .from(vehicles)
        .where(inArray(vehicles.id, vehicleIds));
      for (const v of vehicleRows) {
        const namePart = [v.make, v.model].filter(Boolean).join(' ');
        vehicleMap.set(v.id, namePart ? `${namePart} · ${v.plate}` : v.plate);
      }
    }

    let totalDistanceKm = 0;
    let totalDurationSec = 0;
    let completedTrips = 0;
    const driverTotals = new Map<string, { name: string; trips: number; distanceKm: number; durationSec: number }>();

    for (const t of rows) {
      const driver = driverByUserId.get(t.userId);
      const name = driver?.fullName ?? 'Unknown';
      const driverKey = driver?.id ?? t.userId;
      totalDistanceKm += t.distance ?? 0;
      totalDurationSec += t.durationSec ?? 0;
      if (t.status === 'completed') completedTrips += 1;

      const agg = driverTotals.get(driverKey) ?? { name, trips: 0, distanceKm: 0, durationSec: 0 };
      agg.trips += 1;
      agg.distanceKm += t.distance ?? 0;
      agg.durationSec += t.durationSec ?? 0;
      driverTotals.set(driverKey, agg);
    }

    const avgDurationSec = rows.length > 0 ? Math.round(totalDurationSec / rows.length) : 0;
    const generatedAt = new Date().toISOString();

    let csv = '';
    csv += csvRow(['Fleet Trip Summary Report']);
    csv += csvRow(['Organization', orgName]);
    csv += csvRow(['Period', window.label]);
    csv += csvRow(['Generated', generatedAt]);
    csv += csvRow([]);
    csv += csvRow(['Summary']);
    csv += csvRow(['Total trips', rows.length]);
    csv += csvRow(['Completed trips', completedTrips]);
    csv += csvRow(['Total distance (km)', totalDistanceKm.toFixed(2)]);
    csv += csvRow(['Average trip duration', formatDuration(avgDurationSec)]);
    csv += csvRow([]);
    csv += csvRow(['Driver totals']);
    csv += csvRow(['Driver', 'Trips', 'Distance (km)', 'Duration']);
    for (const agg of driverTotals.values()) {
      csv += csvRow([agg.name, agg.trips, agg.distanceKm.toFixed(2), formatDuration(agg.durationSec)]);
    }
    csv += csvRow([]);
    csv += csvRow(['Trips']);
    csv += csvRow([
      'Trip ID',
      'Title',
      'Driver',
      'Vehicle',
      'Status',
      'Start',
      'End',
      'Distance (km)',
      'Duration',
      'Avg speed (km/h)',
      'Top speed (km/h)',
      'Start location',
      'End location',
    ]);

    for (const t of rows) {
      const driver = driverByUserId.get(t.userId);
      const startGeo = t.startGeocode ? (() => { try { return JSON.parse(t.startGeocode!); } catch { return null; } })() : null;
      const endGeo = t.endGeocode ? (() => { try { return JSON.parse(t.endGeocode!); } catch { return null; } })() : null;
      csv += csvRow([
        t.id,
        t.title,
        driver?.fullName ?? 'Unknown',
        t.vehicleId ? vehicleMap.get(t.vehicleId) ?? '' : '',
        t.status,
        new Date(t.startTime).toISOString(),
        t.endTime ? new Date(t.endTime).toISOString() : '',
        (t.distance ?? 0).toFixed(2),
        formatDuration(t.durationSec),
        msToKmh(t.avgSpeed),
        msToKmh(t.maxSpeed),
        extractPlace(startGeo) ?? '',
        extractPlace(endGeo) ?? '',
      ]);
    }

    const slugFrom = from ?? range ?? '30d';
    const slugTo = to ?? 'now';
    return {
      filename: `tarales-summary-${slugFrom}-${slugTo}.csv`,
      content: csv,
    };
  }

  async buildTripCsv(ownerUserId: string, trackId: string): Promise<{ filename: string; content: string }> {
    const detail = await this.tracksService.getTrackWithPoints(ownerUserId, trackId);
    const { orgName } = await this.resolveFleetContext(ownerUserId);

    let csv = '';
    csv += csvRow(['Trip Report']);
    csv += csvRow(['Organization', orgName]);
    csv += csvRow(['Generated', new Date().toISOString()]);
    csv += csvRow([]);
    csv += csvRow(['Trip details']);
    csv += csvRow(['Trip ID', detail.id]);
    csv += csvRow(['Title', detail.name]);
    csv += csvRow(['Driver', detail.driverName]);
    csv += csvRow(['Vehicle', detail.vehicleName ?? '']);
    csv += csvRow(['Status', detail.status]);
    csv += csvRow(['Start', detail.startTime]);
    csv += csvRow(['End', detail.endTime ?? '']);
    csv += csvRow(['Distance (km)', ((detail.distance ?? 0) / 1000).toFixed(2)]);
    csv += csvRow(['Duration', formatDuration(detail.duration)]);
    csv += csvRow(['Average speed (km/h)', msToKmh(detail.avgSpeed)]);
    csv += csvRow(['Top speed (km/h)', msToKmh(detail.topSpeed)]);
    csv += csvRow(['Idle time', formatDuration(detail.idleTime)]);
    csv += csvRow(['Elevation gain (m)', detail.elevationGain ?? 0]);
    csv += csvRow(['Start location', detail.startAddress ?? '']);
    csv += csvRow(['End location', detail.endAddress ?? '']);
    csv += csvRow(['Notes', detail.notes ?? '']);
    csv += csvRow([]);
    csv += csvRow(['Events']);
    csv += csvRow(['Time', 'Type', 'Description']);
    for (const event of detail.events) {
      csv += csvRow([event.timestamp, event.type, event.description]);
    }
    csv += csvRow([]);
    csv += csvRow(['GPS points']);
    csv += csvRow(['Timestamp', 'Latitude', 'Longitude', 'Speed (km/h)', 'Elevation (m)', 'Accuracy (m)']);
    for (const p of detail.points) {
      csv += csvRow([
        new Date(p.timestamp).toISOString(),
        p.lat,
        p.lng,
        msToKmh(p.speed),
        p.elevation ?? '',
        p.accuracy ?? '',
      ]);
    }

    const safeName = (detail.name ?? detail.id).replace(/[^\w.-]+/g, '-').slice(0, 40);
    return {
      filename: `tarales-trip-${safeName}-${detail.id.slice(0, 8)}.csv`,
      content: csv,
    };
  }

  async buildTripGpx(ownerUserId: string, trackId: string): Promise<{ filename: string; content: string }> {
    const detail = await this.tracksService.getTrackWithPoints(ownerUserId, trackId);
    if (detail.points.length === 0) {
      throw new NotFoundException('Trip has no GPS points to export.');
    }

    const name = detail.name ?? `Trip ${trackId}`;
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Tarales" xmlns="http://www.topografix.com/GPX/1/1">',
      '  <trk>',
      `    <name>${escapeXml(name)}</name>`,
      '    <trkseg>',
    ];

    for (const p of detail.points) {
      lines.push(
        `      <trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.timestamp).toISOString()}</time></trkpt>`,
      );
    }

    lines.push('    </trkseg>', '  </trk>', '</gpx>');
    const safeName = name.replace(/[^\w.-]+/g, '-').slice(0, 40);

    return {
      filename: `tarales-trip-${safeName}.gpx`,
      content: lines.join('\n'),
    };
  }

  toStream(content: string): Readable {
    return Readable.from([content]);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

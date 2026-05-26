import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { geofences } from '../database/schema';
import type { CreateGeofenceDto, UpdateGeofenceDto } from './dto/create-geofence.dto';

// ─── Geometry helpers ────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting point-in-polygon test.
 * @param ring  Array of [lng, lat] pairs (GeoJSON order), closed or open ring.
 */
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Row ↔ API mapper ────────────────────────────────────────────────────────

function rowToApi(g: typeof geofences.$inferSelect) {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    shape: g.shape,
    coordinates: g.coordinates ? (JSON.parse(g.coordinates) as [number, number][]) : undefined,
    center:
      g.centerLng != null && g.centerLat != null
        ? ([g.centerLng, g.centerLat] as [number, number])
        : undefined,
    radiusM: g.radiusM ?? undefined,
    trigger: g.trigger,
    active: g.active,
    createdAt: g.createdAt.toISOString(),
  };
}

// ─── Cache types ─────────────────────────────────────────────────────────────

interface CachedZone {
  id: string;
  name: string;
  shape: string;
  ring?: [number, number][];
  centerLng?: number;
  centerLat?: number;
  radiusM?: number;
  trigger: string;
  active: boolean;
}

interface ZoneCache {
  zones: CachedZone[];
  loadedAt: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

const ZONE_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

@Injectable()
export class GeofencesService {
  /** Per-workspace zone cache. Key = workspaceOwnerId. */
  private readonly zoneCache = new Map<string, ZoneCache>();

  /** Driver presence: driverKey → Set of geofence IDs currently "inside". */
  private readonly driverPresence = new Map<string, Set<string>>();

  constructor(private readonly db: DatabaseService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async list(ownerUserId: string) {
    const rows = await this.db.db
      .select()
      .from(geofences)
      .where(eq(geofences.ownerUserId, ownerUserId));
    return rows.map(rowToApi);
  }

  async create(ownerUserId: string, dto: CreateGeofenceDto) {
    const id = randomUUID();
    const [row] = await this.db.db
      .insert(geofences)
      .values({
        id,
        ownerUserId,
        name: dto.name,
        color: dto.color,
        shape: dto.shape,
        coordinates: dto.coordinates ? JSON.stringify(dto.coordinates) : null,
        centerLng: dto.center?.[0] ?? null,
        centerLat: dto.center?.[1] ?? null,
        radiusM: dto.radiusM ?? null,
        trigger: dto.trigger,
        active: dto.active,
      })
      .returning();
    this.invalidateCache(ownerUserId);
    return rowToApi(row);
  }

  async update(ownerUserId: string, id: string, dto: UpdateGeofenceDto) {
    const [existing] = await this.db.db
      .select()
      .from(geofences)
      .where(eq(geofences.id, id))
      .limit(1);

    if (!existing) throw new NotFoundException(`Geofence ${id} not found`);
    if (existing.ownerUserId !== ownerUserId)
      throw new ForbiddenException('You do not own this geofence');

    const updateData: Partial<typeof geofences.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.shape !== undefined) updateData.shape = dto.shape;
    if (dto.coordinates !== undefined)
      updateData.coordinates = dto.coordinates ? JSON.stringify(dto.coordinates) : null;
    if (dto.center !== undefined) {
      updateData.centerLng = dto.center?.[0] ?? null;
      updateData.centerLat = dto.center?.[1] ?? null;
    }
    if (dto.radiusM !== undefined) updateData.radiusM = dto.radiusM ?? null;
    if (dto.trigger !== undefined) updateData.trigger = dto.trigger;
    if (dto.active !== undefined) updateData.active = dto.active;

    const [updated] = await this.db.db
      .update(geofences)
      .set(updateData)
      .where(and(eq(geofences.id, id), eq(geofences.ownerUserId, ownerUserId)))
      .returning();

    this.invalidateCache(ownerUserId);
    return rowToApi(updated);
  }

  async remove(ownerUserId: string, id: string) {
    const [existing] = await this.db.db
      .select({ id: geofences.id, ownerUserId: geofences.ownerUserId })
      .from(geofences)
      .where(eq(geofences.id, id))
      .limit(1);

    if (!existing) throw new NotFoundException(`Geofence ${id} not found`);
    if (existing.ownerUserId !== ownerUserId)
      throw new ForbiddenException('You do not own this geofence');

    await this.db.db
      .delete(geofences)
      .where(and(eq(geofences.id, id), eq(geofences.ownerUserId, ownerUserId)));

    this.invalidateCache(ownerUserId);
    return { id };
  }

  // ── Tick checking ─────────────────────────────────────────────────────────

  /**
   * Check a driver's current position against all active geofences for a
   * workspace. Returns enter/exit crossing events.
   */
  async checkTick(
    workspaceOwnerId: string,
    driverId: string,
    _driverName: string,
    lat: number,
    lng: number,
  ): Promise<Array<{ geofenceId: string; geofenceName: string; event: 'enter' | 'exit' }>> {
    const zones = await this.getZones(workspaceOwnerId);
    const activeZones = zones.filter((z) => z.active);

    const driverKey = `${workspaceOwnerId}:${driverId}`;
    const prevInside = this.driverPresence.get(driverKey) ?? new Set<string>();
    const nowInside = new Set<string>();

    for (const zone of activeZones) {
      if (this.isInsideZone(zone, lat, lng)) {
        nowInside.add(zone.id);
      }
    }

    const crossings: Array<{ geofenceId: string; geofenceName: string; event: 'enter' | 'exit' }> = [];

    for (const zone of activeZones) {
      const wasIn = prevInside.has(zone.id);
      const isIn = nowInside.has(zone.id);

      if (!wasIn && isIn) {
        // Entered
        if (zone.trigger === 'enter' || zone.trigger === 'both') {
          crossings.push({ geofenceId: zone.id, geofenceName: zone.name, event: 'enter' });
        }
      } else if (wasIn && !isIn) {
        // Exited
        if (zone.trigger === 'exit' || zone.trigger === 'both') {
          crossings.push({ geofenceId: zone.id, geofenceName: zone.name, event: 'exit' });
        }
      }
    }

    this.driverPresence.set(driverKey, nowInside);
    return crossings;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isInsideZone(zone: CachedZone, lat: number, lng: number): boolean {
    if (zone.shape === 'circle') {
      if (zone.centerLat == null || zone.centerLng == null || zone.radiusM == null)
        return false;
      return haversineM(lat, lng, zone.centerLat, zone.centerLng) <= zone.radiusM;
    }
    // polygon
    if (!zone.ring || zone.ring.length < 3) return false;
    return pointInRing(lng, lat, zone.ring);
  }

  private async getZones(workspaceOwnerId: string): Promise<CachedZone[]> {
    const cached = this.zoneCache.get(workspaceOwnerId);
    if (cached && Date.now() - cached.loadedAt < ZONE_CACHE_TTL_MS) {
      return cached.zones;
    }

    const rows = await this.db.db
      .select()
      .from(geofences)
      .where(and(eq(geofences.ownerUserId, workspaceOwnerId), eq(geofences.active, true)));

    const zones: CachedZone[] = rows.map((g) => ({
      id: g.id,
      name: g.name,
      shape: g.shape,
      ring: g.coordinates ? (JSON.parse(g.coordinates) as [number, number][]) : undefined,
      centerLng: g.centerLng ?? undefined,
      centerLat: g.centerLat ?? undefined,
      radiusM: g.radiusM ?? undefined,
      trigger: g.trigger,
      active: g.active,
    }));

    this.zoneCache.set(workspaceOwnerId, { zones, loadedAt: Date.now() });
    return zones;
  }

  private invalidateCache(workspaceOwnerId: string) {
    this.zoneCache.delete(workspaceOwnerId);
  }
}

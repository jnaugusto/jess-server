import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Server, Socket } from 'socket.io';
import { GeofencesService } from '../geofences/geofences.service';
import { PushService } from '../push/push.service';
import { LocationsService } from './locations.service';

interface AuthedSocket extends Socket {
  data: { userId?: string };
}

interface LiveLocationBroadcast {
  driverId: string;
  driverName: string;
  driverCode: string;
  vehicleName?: string;
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  status: 'driving' | 'stopped' | 'speeding' | 'standby';
  locationLabel?: string;
  updatedAt: string;
}

const corsOrigins = new Set([
  ...(
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Capacitor WebView origins — must be allowed or the socket handshake
  // gets a 403 before auth even runs.
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
]);

@WebSocketGateway({
  namespace: '/locations',
  cors: {
    // Allow listed origins AND null/missing origin (native WebViews often
    // omit the Origin header entirely).
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || corsOrigins.has(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`WebSocket origin not allowed: ${origin}`));
      }
    },
    credentials: true,
  },
  // Detect dead sockets (force-killed apps) in ~15 s instead of the
  // default ~45 s so the dashboard ghost clears quickly.
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class LocationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LocationsGateway.name);
  private tickCount = 0;
  /**
   * Presence map: driverUserId → set of socketIds currently connected.
   * A driver is "available" when this set is non-empty; their dashboard
   * dot reflects that even before they start a trip.
   */
  private readonly onlineSockets = new Map<string, Set<string>>();

  /**
   * Tracks when each driver last sent a location:tick.
   * Only set once a tick is received — drivers in "standby" (app open,
   * not tracking) have no entry and are exempt from idle eviction.
   */
  private readonly lastTickAt = new Map<string, number>();

  /**
   * How long (ms) a driver can be silent before we treat their socket as
   * a zombie and force them offline. 10 min >> any plausible standby gap
   * but short enough to clear a locked phone within a reasonable time.
   */
  private static readonly IDLE_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

  /** How often to run the idle-eviction sweep. */
  private static readonly IDLE_CHECK_MS = 2 * 60 * 1_000; // every 2 minutes

  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    private readonly locationsService: LocationsService,
    private readonly geofenceService: GeofencesService,
    private readonly pushService: PushService,
  ) {}

  onModuleInit() {
    this.logger.log('Locations gateway initialised on namespace /locations');

    // Periodically evict drivers whose socket is alive but whose last tick
    // was more than IDLE_TIMEOUT_MS ago. This catches Android foreground-
    // service "zombie" connections where the phone is locked / the user has
    // stopped driving but the TCP socket stays open indefinitely.
    //
    // Drivers who connected but never sent a tick (genuine standby) are
    // intentionally exempt: lastTickAt has no entry for them.
    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [userId, sockets] of this.onlineSockets) {
        if (sockets.size === 0) continue;

        const last = this.lastTickAt.get(userId);
        if (last === undefined) continue; // standby — never tracked, leave alone
        if (now - last < LocationsGateway.IDLE_TIMEOUT_MS) continue;

        const idleMin = Math.round((now - last) / 60_000);
        this.logger.warn(
          `[IdleTimeout] driver ${userId} silent for ${idleMin} min — forcing offline`,
        );

        // Remove from presence maps before announcing so isUserOnline()
        // returns false immediately (prevents a race with announceAvailable).
        this.onlineSockets.delete(userId);
        this.lastTickAt.delete(userId);

        void this.announceUnavailable(userId).catch((e) =>
          this.logger.warn(
            `announceUnavailable failed: ${e instanceof Error ? e.message : e}`,
          ),
        );
      }
    }, LocationsGateway.IDLE_CHECK_MS);
  }

  onModuleDestroy() {
    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  async handleConnection(@ConnectedSocket() client: AuthedSocket) {
    const userId = await this.resolveUserId(client);
    if (!userId) {
      this.logger.warn(
        `socket ${client.id} rejected — auth failed (no/invalid token)`,
      );
      client.emit('error', { error: 'unauthorized' });
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    void client.join(`user:${userId}`);
    this.logger.log(`socket ${client.id} connected (user ${userId})`);

    // Track presence + announce availability to every workspace this user
    // is a driver under. Only fire the announce on the FIRST socket for
    // that user (subsequent dashboard refreshes shouldn't re-announce).
    const sockets = this.onlineSockets.get(userId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(client.id);
    this.onlineSockets.set(userId, sockets);
    if (wasOffline) {
      void this.announceAvailable(userId).catch((e) =>
        this.logger.warn(
          `announceAvailable failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }

    try {
      const snapshot = await this.locationsService.getLiveLocations(userId);
      // Override status to 'available' for any driver in the snapshot
      // whose socket is currently connected — so a dashboard that joins
      // after a phone is already online sees them correctly.
      const enriched = await this.applyPresenceToSnapshot(snapshot);
      client.emit('location:bulk', enriched);
    } catch (err) {
      this.logger.warn(
        `Failed to send initial snapshot to ${client.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async announceAvailable(driverUserId: string) {
    const [driverRows, lastLoc] = await Promise.all([
      this.locationsService.findDriversByDriverUserId(driverUserId),
      this.locationsService.getLastLocationForDriverUser(driverUserId),
    ]);
    for (const meta of driverRows) {
      // Always include driverName/driverCode so the dashboard can show a
      // "Driver online" toast even for a first-time driver who has no prior
      // GPS history (lastLoc === null, e.g. PowerSync not yet synced).
      const payload = lastLoc
        ? ({
            driverId: meta.driverId,
            driverName: meta.driverName,
            driverCode: meta.driverCode,
            vehicleName: meta.vehicleName,
            lat: lastLoc.lat,
            lng: lastLoc.lng,
            speed: lastLoc.speed,
            heading: lastLoc.heading,
            status: 'standby' as const,
            updatedAt: new Date(lastLoc.timestamp).toISOString(),
          } satisfies LiveLocationBroadcast)
        : {
            driverId: meta.driverId,
            driverName: meta.driverName,
            driverCode: meta.driverCode,
          };
      this.server
        .to(`user:${meta.workspaceOwnerUserId}`)
        .emit('driver:available', payload);
    }
  }

  private async announceUnavailable(driverUserId: string) {
    const driverRows =
      await this.locationsService.findDriversByDriverUserId(driverUserId);
    for (const meta of driverRows) {
      this.server
        .to(`user:${meta.workspaceOwnerUserId}`)
        .emit('driver:offline', { driverId: meta.driverId });
    }
  }

  /**
   * For the bulk snapshot we send a dashboard on connect: filter to only
   * drivers whose phones currently have a live socket. Disconnected
   * drivers don't appear at all (they re-appear when they sign in).
   */
  private async applyPresenceToSnapshot(
    snapshot: Awaited<
      ReturnType<LocationsService['getLiveLocations']>
    >,
  ) {
    if (this.onlineSockets.size === 0 || snapshot.length === 0) return [];
    const idsToCheck = snapshot.map((s) => s.driverId);
    const driverUserMap =
      await this.locationsService.mapDriverIdToDriverUserId(idsToCheck);
    return snapshot.filter((s) => {
      const driverUserId = driverUserMap.get(s.driverId);
      if (!driverUserId) return false;
      const sockets = this.onlineSockets.get(driverUserId);
      return !!sockets && sockets.size > 0;
    });
  }

  handleDisconnect(@ConnectedSocket() client: AuthedSocket) {
    this.logger.log(
      `socket ${client.id} disconnected (user ${client.data.userId ?? '—'})`,
    );

    const userId = client.data.userId;
    if (!userId) return;

    const sockets = this.onlineSockets.get(userId);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.onlineSockets.delete(userId);
      // Last connection for this driver-user just dropped — flip the
      // dashboard dot to offline (unless they're still mid-trip on a
      // dashboard that gets explicit `driver:offline` filtered… we keep
      // it simple and just emit unavailable).
      this.lastTickAt.delete(userId); // clean up idle-tracking state
      void this.announceUnavailable(userId).catch((e) =>
        this.logger.warn(
          `announceUnavailable failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }
  }

  /**
   * Broadcast a single driver location update to that workspace.
   * Call this from anywhere (e.g. ingestion service) to push live ticks.
   */
  broadcastLocation(workspaceUserId: string, payload: LiveLocationBroadcast) {
    this.server.to(`user:${workspaceUserId}`).emit('location:update', payload);
  }

  /**
   * Live tick from a phone. Authenticated via the socket handshake on
   * connect — `client.data.userId` is the *driver's* user_id.
   *
   * We translate it into the standard LiveLocationBroadcast shape and
   * fan it out to every workspace that has this user as a driver. This
   * is idempotent with the post-PowerSync-upload broadcast: the dashboard
   * key-merges by driverId, so duplicates just overwrite the older fix.
   */
  @SubscribeMessage('location:tick')
  async handleTick(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      trackId?: string;
      lat: number;
      lng: number;
      accuracy?: number | null;
      altitude?: number | null;
      speed?: number | null;
      heading?: number | null;
      timestamp: number;
    },
  ) {
    const driverUserId = client.data.userId;
    if (!driverUserId) {
      client.emit('error', { error: 'unauthorized' });
      return;
    }
    if (
      !body ||
      typeof body.lat !== 'number' ||
      typeof body.lng !== 'number' ||
      typeof body.timestamp !== 'number'
    ) {
      return; // ignore malformed
    }

    // Record activity so the idle-eviction sweep can distinguish a live
    // tracking session from a zombie foreground-service socket.
    this.lastTickAt.set(driverUserId, Date.now());

    const driverRows =
      await this.locationsService.findDriversByDriverUserId(driverUserId);
    if (driverRows.length === 0) {
      if (this.tickCount % 50 === 0) {
        this.logger.warn(
          `tick from user ${driverUserId} ignored — no driver row links them to a workspace`,
        );
      }
      this.tickCount++;
      return;
    }

    // Log first tick + every 25th to confirm flow without flooding.
    if (this.tickCount === 0 || this.tickCount % 25 === 0) {
      this.logger.log(
        `tick #${this.tickCount} from user ${driverUserId} → ${driverRows.length} workspace(s)`,
      );
    }
    this.tickCount++;

    const locationLabel = this.locationsService.getCachedLabel(driverUserId);

    for (const meta of driverRows) {
      const payload = this.locationsService.buildBroadcastPayload(
        {
          latitude: body.lat,
          longitude: body.lng,
          speed: body.speed ?? null,
          heading: body.heading ?? null,
          timestamp: body.timestamp,
        },
        {
          driverId: meta.driverId,
          driverName: meta.driverName,
          driverCode: meta.driverCode,
          vehicleName: meta.vehicleName,
          locationLabel,
        },
      );
      this.broadcastLocation(meta.workspaceOwnerUserId, payload);

      const crossings = await this.geofenceService.checkTick(
        meta.workspaceOwnerUserId,
        meta.driverId,
        meta.driverName,
        body.lat,
        body.lng,
      );
      for (const crossing of crossings) {
        const alertPayload = {
          driverId: meta.driverId,
          driverName: meta.driverName,
          geofenceId: crossing.geofenceId,
          geofenceName: crossing.geofenceName,
          event: crossing.event,
          lat: body.lat,
          lng: body.lng,
          timestamp: new Date().toISOString(),
        };

        // Real-time WebSocket alert
        this.server.to(`user:${meta.workspaceOwnerUserId}`).emit('geofence:alert', alertPayload);

        // Background push notification (don't await — never block the tick path)
        void this.pushService
          .notify(meta.workspaceOwnerUserId, {
            title: `Geofence ${crossing.event === 'enter' ? 'Entry' : 'Exit'}`,
            body: `${meta.driverName} ${crossing.event === 'enter' ? 'entered' : 'exited'} "${crossing.geofenceName}"`,
            url: '/live',
          })
          .catch((e: unknown) =>
            this.logger.warn(
              `Push notify failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }
    }

    void this.locationsService.refreshLabelIfStale(driverUserId, body.lat, body.lng).catch(() => {});
  }

  /**
   * Mark a driver offline for a workspace.
   */
  markDriverOffline(workspaceUserId: string, driverId: string) {
    this.server
      .to(`user:${workspaceUserId}`)
      .emit('driver:offline', { driverId });
  }

  /**
   * Tell a workspace that a driver is on standby (app open, no trip).
   * Used by the upload path right after a trip-completed event so the
   * dashboard doesn't get stuck on `off_duty` when the phone is still
   * connected.
   */
  markDriverAvailable(workspaceUserId: string, driverId: string) {
    this.server
      .to(`user:${workspaceUserId}`)
      .emit('driver:available', { driverId });
  }

  /**
   * True if a phone (one or more sockets) is currently connected for
   * this user. Used by the upload path to decide whether to follow a
   * `driver:offline` with a `driver:available` (standby) emit.
   */
  isUserOnline(driverUserId: string): boolean {
    const set = this.onlineSockets.get(driverUserId);
    return !!set && set.size > 0;
  }

  /**
   * Push the full snapshot to a workspace (e.g. after a bulk ingest).
   */
  broadcastBulk(workspaceUserId: string, payload: LiveLocationBroadcast[]) {
    this.server.to(`user:${workspaceUserId}`).emit('location:bulk', payload);
  }

  private async resolveUserId(client: Socket): Promise<string | null> {
    const headers = client.handshake.headers as Record<string, string | undefined>;
    const cookieHeader = headers.cookie ?? '';
    const sessionToken =
      this.cookieValue(cookieHeader, 'better-auth.session_token') ??
      this.cookieValue(cookieHeader, '__Secure-better-auth.session_token');

    const handshakeAuth = (client.handshake.auth ?? {}) as Record<string, string>;
    const authHeader =
      headers.authorization ??
      (handshakeAuth.token ? `Bearer ${handshakeAuth.token}` : undefined) ??
      (sessionToken ? `Bearer ${sessionToken}` : undefined);

    if (!authHeader) return null;

    try {
      const session = await this.authService.instance.api.getSession({
        headers: { authorization: authHeader, cookie: cookieHeader } as any,
      });
      return session?.user?.id ?? null;
    } catch (err) {
      this.logger.debug(
        `socket auth failed for ${client.id}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private cookieValue(cookieHeader: string, name: string): string | undefined {
    if (!cookieHeader) return undefined;
    const parts = cookieHeader.split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq);
      if (k === name) {
        return decodeURIComponent(part.slice(eq + 1));
      }
    }
    return undefined;
  }
}

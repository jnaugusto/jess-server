import { Inject, Logger, OnModuleInit } from '@nestjs/common';
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
  status: 'driving' | 'stopped' | 'speeding' | 'off_duty' | 'standby';
  locationLabel?: string;
  updatedAt: string;
}

const corsOrigins = (
  process.env.CORS_ORIGINS ??
  'http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: '/locations',
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
})
export class LocationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(LocationsGateway.name);
  private tickCount = 0;
  /**
   * Presence map: driverUserId → set of socketIds currently connected.
   * A driver is "available" when this set is non-empty; their dashboard
   * dot reflects that even before they start a trip.
   */
  private readonly onlineSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    private readonly locationsService: LocationsService,
  ) {}

  onModuleInit() {
    this.logger.log('Locations gateway initialised on namespace /locations');
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
    const driverRows =
      await this.locationsService.findDriversByDriverUserId(driverUserId);
    for (const meta of driverRows) {
      this.server
        .to(`user:${meta.workspaceOwnerUserId}`)
        .emit('driver:available', { driverId: meta.driverId });
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
   * For the bulk snapshot we send a dashboard on connect: any driver
   * whose underlying user has at least one open phone socket gets their
   * status bumped to 'available' (distinct from a stale 'offline').
   */
  private async applyPresenceToSnapshot(
    snapshot: Awaited<
      ReturnType<LocationsService['getLiveLocations']>
    >,
  ) {
    if (this.onlineSockets.size === 0) return snapshot;
    // Resolve each driverId in the snapshot to its driverUserId so we
    // can check presence. We do one batched query via the service.
    const idsToCheck = snapshot.map((s) => s.driverId);
    if (idsToCheck.length === 0) return snapshot;

    const driverUserMap =
      await this.locationsService.mapDriverIdToDriverUserId(idsToCheck);
    return snapshot.map((s) => {
      const driverUserId = driverUserMap.get(s.driverId);
      if (!driverUserId) return s;
      const sockets = this.onlineSockets.get(driverUserId);
      if (!sockets || sockets.size === 0) return s;
      // Phone is connected — but only override if the existing status is
      // 'off_duty'. If they're actively in a trip we keep the real status.
      if (s.status === 'off_duty') return { ...s, status: 'standby' as const };
      return s;
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
        },
      );
      this.broadcastLocation(meta.workspaceOwnerUserId, payload);
    }
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

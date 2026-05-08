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
  status: 'moving' | 'idle' | 'alert' | 'offline';
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
      client.emit('error', { error: 'unauthorized' });
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    void client.join(`user:${userId}`);
    this.logger.debug(`socket ${client.id} connected (user ${userId})`);

    try {
      const snapshot = await this.locationsService.getLiveLocations(userId);
      client.emit('location:bulk', snapshot);
    } catch (err) {
      this.logger.warn(
        `Failed to send initial snapshot to ${client.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  handleDisconnect(@ConnectedSocket() client: AuthedSocket) {
    this.logger.debug(`socket ${client.id} disconnected`);
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
    if (driverRows.length === 0) return;

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

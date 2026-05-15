import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      username: env.REDIS_USERNAME,
      password: env.REDIS_PASSWORD,
      ...(env.REDIS_TLS === 'true' && { tls: {} }),
    });
  }

  getClient(): Redis {
    return this.client;
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}

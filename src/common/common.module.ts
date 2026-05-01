import { Global, Module } from '@nestjs/common';
import { QueueService } from './services/queue.service';
import { RedisService } from './services/redis.service';

@Global()
@Module({
  providers: [QueueService, RedisService],
  exports: [QueueService, RedisService],
})
export class CommonModule {}

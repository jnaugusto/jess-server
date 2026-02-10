import { Global, Module } from '@nestjs/common';
import { QueueService } from './services/queue.service';

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class CommonModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PowerSyncController } from './powersync.controller';
import { PowerSyncService } from './powersync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PowerSyncController],
  providers: [PowerSyncService],
  exports: [PowerSyncService],
})
export class PowerSyncModule {}

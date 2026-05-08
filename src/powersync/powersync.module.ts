import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LocationsModule } from '../locations/locations.module';
import { PowerSyncController } from './powersync.controller';
import { PowerSyncService } from './powersync.service';

@Module({
  // LocationsModule exports LocationsService + LocationsGateway so the
  // upload handler can broadcast live ticks as a side-effect of sync.
  imports: [DatabaseModule, LocationsModule],
  controllers: [PowerSyncController],
  providers: [PowerSyncService],
  exports: [PowerSyncService],
})
export class PowerSyncModule {}

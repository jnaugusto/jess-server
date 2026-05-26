import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GeofencesModule } from '../geofences/geofences.module';
import { PushModule } from '../push/push.module';
import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';

@Module({
  imports: [DatabaseModule, GeofencesModule, PushModule],
  controllers: [LocationsController],
  providers: [LocationsService, LocationsGateway],
  exports: [LocationsService, LocationsGateway],
})
export class LocationsModule {}

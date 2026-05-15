import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DriversAuthController } from './drivers-auth.controller';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DriversController, DriversAuthController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}

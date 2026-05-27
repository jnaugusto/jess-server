import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TracksModule } from '../tracks/tracks.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [DatabaseModule, TracksModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

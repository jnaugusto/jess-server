import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TracksController],
  providers: [TracksService],
  exports: [TracksService],
})
export class TracksModule implements OnModuleInit {
  constructor(private readonly tracksService: TracksService) {}

  onModuleInit() {
    // Fire-and-forget: backfill runs in the background after startup.
    this.tracksService.backfillGeocode().catch(() => {});
  }
}

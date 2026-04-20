import { Module } from '@nestjs/common';
import { AnalyzeSiteController } from './analyze-site.controller';
import { AnalyzeSiteService } from './analyze-site.service';

@Module({
  controllers: [AnalyzeSiteController],
  providers: [AnalyzeSiteService],
  exports: [AnalyzeSiteService],
})
export class AnalyzeSiteModule {}

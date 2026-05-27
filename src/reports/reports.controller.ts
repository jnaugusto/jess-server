import { Controller, Get, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Download fleet trip summary report (CSV)' })
  async downloadSummary(
    @Session() session: UserSession,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('range') range?: string,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.reportsService.buildSummaryCsv(
      session.user.id,
      from,
      to,
      range,
    );
    return new StreamableFile(this.reportsService.toStream(content), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('trips/:trackId/gpx')
  @ApiOperation({ summary: 'Export trip route as GPX' })
  async downloadTripGpx(
    @Session() session: UserSession,
    @Param('trackId') trackId: string,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.reportsService.buildTripGpx(
      session.user.id,
      trackId,
    );
    return new StreamableFile(this.reportsService.toStream(content), {
      type: 'application/gpx+xml',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('trips/:trackId')
  @ApiOperation({ summary: 'Download single trip report (CSV)' })
  async downloadTripReport(
    @Session() session: UserSession,
    @Param('trackId') trackId: string,
  ): Promise<StreamableFile> {
    const { filename, content } = await this.reportsService.buildTripCsv(
      session.user.id,
      trackId,
    );
    return new StreamableFile(this.reportsService.toStream(content), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

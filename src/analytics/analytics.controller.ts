import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Fleet analytics for the dashboard' })
  @ResponseMessage('Analytics retrieved.')
  get(
    @Session() session: UserSession,
    @Query('range') range?: string,
  ) {
    return this.analyticsService.getAnalytics(session.user.id, range);
  }
}

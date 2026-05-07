import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { OverviewService } from './overview.service';

@ApiTags('overview')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard KPI bundle' })
  @ResponseMessage('Overview retrieved.')
  getOverview(@Session() session: UserSession) {
    return this.overviewService.getOverview(session.user.id);
  }
}

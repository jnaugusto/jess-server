import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { TracksService } from './tracks.service';

@ApiTags('tracks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tracks for the current user' })
  @ResponseMessage('Tracks retrieved.')
  getTracks(@Session() session: UserSession) {
    return this.tracksService.getTracks(session.user.id);
  }

  @Get('with-points')
  @ApiOperation({ summary: 'Get all tracks with their location points in a single query' })
  @ResponseMessage('Tracks with points retrieved.')
  getTracksWithPoints(@Session() session: UserSession) {
    return this.tracksService.getTracksWithPoints(session.user.id);
  }

  @Get(':trackId/detail')
  @ApiOperation({ summary: 'Get a single track with all its points' })
  @ResponseMessage('Track retrieved.')
  getTrackWithPoints(@Session() session: UserSession, @Param('trackId') trackId: string) {
    return this.tracksService.getTrackWithPoints(session.user.id, trackId);
  }

  @Get(':trackId/points')
  @ApiOperation({ summary: 'Get location points for a track' })
  @ResponseMessage('Track points retrieved.')
  getPoints(@Session() session: UserSession, @Param('trackId') trackId: string) {
    return this.tracksService.getPoints(session.user.id, trackId);
  }
}

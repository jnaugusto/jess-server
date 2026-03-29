import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TracksService } from './tracks.service';

@ApiTags('tracks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tracks for the current user' })
  getTracks(@Session() session: UserSession) {
    return this.tracksService.getTracks(session.user.id);
  }

  @Get('with-points')
  @ApiOperation({ summary: 'Get all tracks with their location points in a single query' })
  getTracksWithPoints(@Session() session: UserSession) {
    return this.tracksService.getTracksWithPoints(session.user.id);
  }

  @Get(':trackId/points')
  @ApiOperation({ summary: 'Get location points for a track' })
  getPoints(@Session() session: UserSession, @Param('trackId') trackId: string) {
    return this.tracksService.getPoints(session.user.id, trackId);
  }
}

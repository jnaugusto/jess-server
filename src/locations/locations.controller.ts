import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get locations for a device in a time range' })
  @ApiQuery({ name: 'deviceId', required: true })
  @ApiQuery({ name: 'from', required: true, description: 'Unix ms timestamp' })
  @ApiQuery({ name: 'to', required: true, description: 'Unix ms timestamp' })
  getLocations(
    @Session() session: UserSession,
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.locationsService.getLocations(
      session.user.id,
      deviceId,
      Number(from),
      Number(to),
    );
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get all device IDs for the current user' })
  getDevices(@Session() session: UserSession) {
    return this.locationsService.getDevices(session.user.id);
  }
}

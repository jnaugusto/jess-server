import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { DebugEmitDto } from './dto/debug-emit.dto';
import { GetLocationsDto } from './dto/get-locations.dto';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly locationsGateway: LocationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get locations for a device in a time range' })
  @ResponseMessage('Locations retrieved.')
  getLocations(
    @Session() session: UserSession,
    @Query() dto: GetLocationsDto,
  ) {
    return this.locationsService.getLocations(session.user.id, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get all device IDs for the current user' })
  @ResponseMessage('Devices retrieved.')
  getDevices(@Session() session: UserSession) {
    return this.locationsService.getDevices(session.user.id);
  }

  @Get('live')
  @ApiOperation({ summary: 'Last-known live position per driver' })
  @ResponseMessage('Live locations retrieved.')
  getLive(@Session() session: UserSession) {
    return this.locationsService.getLiveLocations(session.user.id);
  }

  @Post('debug/emit')
  @ApiOperation({
    summary: 'Dev-only: emit a fake live location update via Socket.IO',
  })
  @ResponseMessage('Live update emitted.')
  async debugEmit(
    @Session() session: UserSession,
    @Body() dto: DebugEmitDto,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Debug emit is disabled in production.');
    }

    const driver = await this.locationsService.findDriverForEmit(
      session.user.id,
      dto.driverId,
    );
    if (!driver) {
      throw new NotFoundException(
        dto.driverId
          ? `Driver ${dto.driverId} not found in workspace.`
          : 'No drivers in workspace yet — create one first.',
      );
    }

    const speedKmh = dto.speed ?? 35;
    const status =
      dto.status ??
      (speedKmh >= 90 ? 'speeding' : speedKmh <= 1 ? 'stopped' : 'driving');

    const payload = {
      driverId: driver.driverId,
      driverName: driver.driverName,
      driverCode: driver.driverCode,
      vehicleName: driver.vehicleName,
      lat: dto.lat,
      lng: dto.lng,
      speed: Math.round(speedKmh * 10) / 10,
      heading: dto.heading,
      status,
      updatedAt: new Date().toISOString(),
    } as const;

    this.locationsGateway.broadcastLocation(session.user.id, payload);
    return payload;
  }
}

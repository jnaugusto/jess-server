import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { GetLocationsDto } from './dto/get-locations.dto';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

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
}

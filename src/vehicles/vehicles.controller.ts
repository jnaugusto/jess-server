import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VehiclesService } from './vehicles.service';
import { createVehicleSchema } from './dto/create-vehicle.dto';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import { updateVehicleSchema } from './dto/update-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: 'List vehicles for the current user' })
  @ResponseMessage('Vehicles retrieved.')
  list(@Session() session: UserSession, @Query('status') status?: string) {
    return this.vehiclesService.list(session.user.id, status);
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Upcoming/overdue maintenance entries' })
  @ResponseMessage('Maintenance schedule retrieved.')
  maintenance(
    @Session() session: UserSession,
    @Query('days') days?: string,
  ) {
    const window = days ? Math.max(1, Math.min(365, Number(days) || 30)) : 30;
    return this.vehiclesService.maintenance(session.user.id, window);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vehicle detail' })
  @ResponseMessage('Vehicle retrieved.')
  getById(@Session() session: UserSession, @Param('id') id: string) {
    return this.vehiclesService.getById(session.user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a vehicle' })
  @ResponseMessage('Vehicle created.')
  create(@Session() session: UserSession, @Body(new ZodValidationPipe(createVehicleSchema)) dto: CreateVehicleDto) {
    return this.vehiclesService.create(session.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vehicle' })
  @ResponseMessage('Vehicle updated.')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(session.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a vehicle' })
  @ResponseMessage('Vehicle deleted.')
  delete(@Session() session: UserSession, @Param('id') id: string) {
    return this.vehiclesService.delete(session.user.id, id);
  }
}

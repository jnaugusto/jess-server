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
import { DriversService } from './drivers.service';
import { createDriverSchema } from './dto/create-driver.dto';
import type { CreateDriverDto } from './dto/create-driver.dto';
import { updateDriverSchema } from './dto/update-driver.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';

@ApiTags('drivers')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /**
   * Returns all fleet memberships for the authenticated driver user.
   * Used by the mobile app fleet selector before tracking starts.
   * Route must be declared before :id to avoid being swallowed by the param route.
   */
  @Get('my-fleets')
  @ApiOperation({ summary: 'Get all fleet memberships for the authenticated driver' })
  @ResponseMessage('Fleets retrieved.')
  getMyFleets(@Session() session: UserSession) {
    return this.driversService.getMyFleets(session.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List drivers for the current user' })
  @ResponseMessage('Drivers retrieved.')
  list(
    @Session() session: UserSession,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.driversService.list(session.user.id, status, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get driver detail' })
  @ResponseMessage('Driver retrieved.')
  getById(@Session() session: UserSession, @Param('id') id: string) {
    return this.driversService.getById(session.user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a driver manually' })
  @ResponseMessage('Driver created.')
  create(@Session() session: UserSession, @Body(new ZodValidationPipe(createDriverSchema)) dto: CreateDriverDto) {
    return this.driversService.create(session.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a driver' })
  @ResponseMessage('Driver updated.')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDriverSchema)) dto: UpdateDriverDto,
  ) {
    return this.driversService.update(session.user.id, id, dto);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a driver' })
  @ResponseMessage('Driver deactivated.')
  deactivate(@Session() session: UserSession, @Param('id') id: string) {
    return this.driversService.deactivate(session.user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a driver' })
  @ResponseMessage('Driver deleted.')
  delete(@Session() session: UserSession, @Param('id') id: string) {
    return this.driversService.delete(session.user.id, id);
  }
}

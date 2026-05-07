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
  UsePipes,
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
  @UsePipes(new ZodValidationPipe(createDriverSchema))
  create(@Session() session: UserSession, @Body() dto: CreateDriverDto) {
    return this.driversService.create(session.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a driver' })
  @ResponseMessage('Driver updated.')
  @UsePipes(new ZodValidationPipe(updateDriverSchema))
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
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

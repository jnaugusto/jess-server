import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { GeofencesService } from './geofences.service';
import { CreateGeofenceSchema, UpdateGeofenceSchema } from './dto/create-geofence.dto';

@UseGuards(AuthGuard)
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly svc: GeofencesService) {}

  @Get()
  async list(@Session() session: UserSession) {
    return this.svc.list(session.user.id);
  }

  @Post()
  async create(@Session() session: UserSession, @Body() body: unknown) {
    const dto = CreateGeofenceSchema.parse(body);
    return this.svc.create(session.user.id, dto);
  }

  @Patch(':id')
  async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateGeofenceSchema.parse(body);
    return this.svc.update(session.user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Session() session: UserSession, @Param('id') id: string) {
    return this.svc.remove(session.user.id, id);
  }
}

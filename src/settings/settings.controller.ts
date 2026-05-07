import { Body, Controller, Get, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SettingsService } from './settings.service';
import { updateSettingsSchema } from './dto/update-settings.dto';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user settings (creates defaults on first read)' })
  @ResponseMessage('Settings retrieved.')
  get(@Session() session: UserSession) {
    return this.settingsService.get(session.user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user settings' })
  @ResponseMessage('Settings updated.')
  @UsePipes(new ZodValidationPipe(updateSettingsSchema))
  update(@Session() session: UserSession, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(session.user.id, dto);
  }
}

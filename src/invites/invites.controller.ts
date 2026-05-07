import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { inviteDriverSchema } from '../drivers/dto/invite-driver.dto';
import type { InviteDriverDto } from '../drivers/dto/invite-driver.dto';
import { InvitesService } from './invites.service';

@ApiTags('invites')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Get('invites')
  @ApiOperation({ summary: 'List pending invites for the current user' })
  @ResponseMessage('Invites retrieved.')
  list(@Session() session: UserSession) {
    return this.invitesService.listPending(session.user.id);
  }

  @Post('drivers/invite')
  @ApiOperation({ summary: 'Create a driver invite (email or link mode)' })
  @ResponseMessage('Invite created.')
  @UsePipes(new ZodValidationPipe(inviteDriverSchema))
  create(@Session() session: UserSession, @Body() dto: InviteDriverDto) {
    return this.invitesService.createInvite(
      session.user.id,
      session.user.name,
      dto,
    );
  }

  @Post('invites/:id/resend')
  @ApiOperation({ summary: 'Resend an invite email' })
  @ResponseMessage('Invite resent.')
  resend(@Session() session: UserSession, @Param('id') id: string) {
    return this.invitesService.resendInvite(session.user.id, session.user.name, id);
  }

  @Delete('invites/:id')
  @ApiOperation({ summary: 'Revoke an invite' })
  @ResponseMessage('Invite revoked.')
  revoke(@Session() session: UserSession, @Param('id') id: string) {
    return this.invitesService.revokeInvite(session.user.id, id);
  }
}

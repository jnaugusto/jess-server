import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { InvitesService } from './invites.service';

@ApiTags('invites-public')
@Controller('invites/by-token')
export class InvitesPublicController {
  constructor(private readonly invitesService: InvitesService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Look up invite metadata by token (public)' })
  @ResponseMessage('Invite found.')
  lookup(@Param('token') token: string) {
    return this.invitesService.lookupByToken(token);
  }

  @Public()
  @Post(':token/register')
  @ApiOperation({ summary: 'Create an account and accept the invite in one step (new drivers)' })
  @ResponseMessage('Account created and invite accepted.')
  register(
    @Param('token') token: string,
    @Body() body: { password: string },
  ) {
    return this.invitesService.registerAndAccept(token, body.password);
  }

  @Post(':token/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Accept an invite (requires auth as the accepting user)' })
  @ResponseMessage('Invite accepted.')
  accept(@Param('token') token: string, @Session() session: UserSession) {
    return this.invitesService.acceptInvite(token, session.user.id);
  }
}

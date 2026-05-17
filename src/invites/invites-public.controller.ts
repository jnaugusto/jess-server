import { Body, Controller, Get, Param, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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

  /**
   * Called when the driver first opens the invite link.
   * Records openedAt on the invite (once) — even before they have an account.
   * Returns the same invite metadata as the GET so the web page needs only one call.
   */
  @Public()
  @Post(':token/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark invite as opened (invite link clicked)' })
  @ResponseMessage('Invite opened.')
  open(@Param('token') token: string) {
    return this.invitesService.openInvite(token);
  }

  /**
   * Check the login status for an email — used by the driver app's multi-step login.
   * Returns whether the email belongs to an existing driver account or a pending invite.
   */
  @Public()
  @Post('check-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check email status for app login flow' })
  @ResponseMessage('Email status resolved.')
  checkEmail(@Body() body: { email: string }) {
    return this.invitesService.checkEmailStatus(body.email);
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

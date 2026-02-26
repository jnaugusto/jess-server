import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../auth/guards/auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @UseGuards(AuthGuard)
  getProfile(@Session() session: UserSession) {
    return {
      email: session.user.email,
      name: session.user.name,
      id: session.user.id,
    };
  }
}

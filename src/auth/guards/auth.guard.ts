import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, UserSession } from '@thallesp/nestjs-better-auth';
import { Request } from 'express';

interface RequestWithAuth extends Request {
  user?: UserSession['user'];
  session?: UserSession;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    try {
      // Use Better Auth's session verification
      const session = await this.authService.instance.api.getSession({
        headers: request.headers as any,
      });

      if (!session) {
        this.logger.error('Session not found for provided headers');
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Attach user and session to the request object
      request.user = session.user;
      request.session = session;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Auth verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Authentication failed');
    }
  }
}

import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
export declare class AuthGuard implements CanActivate {
    private readonly authService;
    private readonly logger;
    constructor(authService: AuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

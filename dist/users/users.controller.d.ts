import { type UserSession } from '@thallesp/nestjs-better-auth';
export declare class UsersController {
    getProfile(session: UserSession): {
        email: string;
        name: string;
        id: string;
    };
}

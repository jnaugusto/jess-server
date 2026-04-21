import { type UserSession } from '@thallesp/nestjs-better-auth';
import { PowerSyncService, PowerSyncTransaction } from './powersync.service';
export declare class PowerSyncController {
    private readonly powerSyncService;
    constructor(powerSyncService: PowerSyncService);
    getToken(session: UserSession): Promise<{
        token: string;
    }>;
    upload(body: PowerSyncTransaction, session: UserSession): Promise<{
        success: boolean;
    }>;
}

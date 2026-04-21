import { DatabaseService } from '../database/database.service';
export declare class PowerSyncOp {
    table: string;
    op: 'PUT' | 'PATCH' | 'DELETE';
    row: Record<string, unknown>;
}
export declare class PowerSyncTransaction {
    ops: PowerSyncOp[];
}
export declare class PowerSyncService {
    private readonly databaseService;
    constructor(databaseService: DatabaseService);
    generateToken(userId: string): Promise<string>;
    handleUpload(userId: string, transaction: PowerSyncTransaction): Promise<void>;
    private handlePut;
    private handlePatch;
    private handleDelete;
}

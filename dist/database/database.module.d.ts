import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';
export declare class DatabaseModule implements OnModuleInit, OnModuleDestroy {
    private readonly databaseService;
    private readonly logger;
    constructor(databaseService: DatabaseService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}

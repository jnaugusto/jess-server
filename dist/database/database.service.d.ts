import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
export declare class DatabaseService {
    private readonly pool;
    readonly db: NodePgDatabase<typeof schema>;
    constructor(pool: Pool);
    query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
    getClient(): Promise<import("pg").PoolClient>;
    close(): Promise<void>;
    transaction<T>(callback: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T>;
}

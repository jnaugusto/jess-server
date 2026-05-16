import { Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from '../env';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        return new Pool({
          connectionString: env.DATABASE_URL,
        });
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService, 'DATABASE_POOL'],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.databaseService.query('SELECT 1');
      this.logger.log('Database connected successfully');
      await this.databaseService.query(
        `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS start_geocode text`,
      );
      await this.databaseService.query(
        `ALTER TABLE tracks ADD COLUMN IF NOT EXISTS end_geocode text`,
      );
    } catch (e) {
      this.logger.error(
        `Failed to connect to database: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.databaseService.close();
  }
}

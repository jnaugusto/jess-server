import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
  constructor(private databaseService: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.databaseService.query('SELECT 1');
      console.log('Database connected successfully');
    } catch (e) {
      console.error('Failed to connect to database:', e);
    }
  }

  async onModuleDestroy() {
    await this.databaseService.close();
  }
}

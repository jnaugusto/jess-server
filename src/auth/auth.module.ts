import { DynamicModule, Global, Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { createAuth } from './auth';

@Global()
@Module({})
export class AuthModule {
  static register(): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        BetterAuthModule.forRootAsync({
          isGlobal: true,
          disableGlobalAuthGuard: false, // We'll use decorators to protect routes
          imports: [DatabaseModule],
          inject: [DatabaseService],
          useFactory: (databaseService: DatabaseService) => {
            return {
              auth: createAuth(databaseService.db),
            };
          },
        }),
      ],
      controllers: [],
      exports: [BetterAuthModule],
    };
  }
}

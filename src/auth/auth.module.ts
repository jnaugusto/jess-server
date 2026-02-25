import { DynamicModule, Global, Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { Pool } from 'pg';
import { createAuth } from './auth';
import { AuthController } from './auth.controller';

@Global()
@Module({})
export class AuthModule {
  static register(): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        BetterAuthModule.forRootAsync({
          useFactory: (pool: Pool) => {
            return {
              auth: createAuth(pool),
              disableGlobalAuthGuard: false,
            };
          },
          inject: ['DATABASE_POOL'],
        }),
      ],
      controllers: [AuthController],
      exports: [BetterAuthModule],
    };
  }
}

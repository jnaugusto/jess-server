import { createEnv } from '@t3-oss/env-core';
import 'dotenv/config';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .default('3005')
      .transform((s) => parseInt(s, 10)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z
      .string()
      .default('6379')
      .transform((s) => parseInt(s, 10)),
    PLAYWRIGHT_POOL_SIZE: z
      .string()
      .default('3')
      .transform((s) => parseInt(s, 10)),
    PLAYWRIGHT_MAX_PAGES: z
      .string()
      .default('10')
      .transform((s) => parseInt(s, 10)),
    DATABASE_URL: z.url().describe('PostgreSQL connection string'),
    POWERSYNC_URL: z.url().describe('PowerSync service URL'),
    POWERSYNC_JWT_PRIVATE_KEY: z
      .string()
      .describe('Base64 encoded private key for PowerSync JWT signing'),
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

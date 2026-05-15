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
    REDIS_USERNAME: z.string().default('default').describe('Redis username'),
    REDIS_PASSWORD: z.string().describe('Redis password'),
    REDIS_TLS: z.string().default('false').describe('Set to "true" to enable TLS (required for Redis Cloud)'),
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
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000')
      .transform((s) => s.split(',').map((o) => o.trim()))
      .describe('Comma-separated list of allowed CORS origins'),
    ANTHROPIC_API_KEY: z.string().describe('Anthropic API key for Claude'),
    GOOGLE_OAUTH_CLIENT_ID: z.string().describe('Google OAuth2 client ID'),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().describe('Google OAuth2 client secret'),
    GOOGLE_OAUTH_REFRESH_TOKEN: z.string().describe('Google OAuth2 refresh token (generated once via OAuth Playground)'),
    GOOGLE_DRIVE_FOLDER_ID: z.string().describe('Google Drive folder ID to upload files into'),
    RESEND_API_KEY: z.string().describe('Resend API key for transactional emails'),
    RESEND_FROM: z.string().describe('Email sender address for invites'),
    PUBLIC_WEB_URL: z.string().url().describe('Public web URL for invite accept links'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

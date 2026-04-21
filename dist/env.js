"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const env_core_1 = require("@t3-oss/env-core");
require("dotenv/config");
const zod_1 = require("zod");
exports.env = (0, env_core_1.createEnv)({
    server: {
        PORT: zod_1.z
            .string()
            .default('3005')
            .transform((s) => parseInt(s, 10)),
        NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
        REDIS_HOST: zod_1.z.string().default('localhost'),
        REDIS_PORT: zod_1.z
            .string()
            .default('6379')
            .transform((s) => parseInt(s, 10)),
        PLAYWRIGHT_POOL_SIZE: zod_1.z
            .string()
            .default('3')
            .transform((s) => parseInt(s, 10)),
        PLAYWRIGHT_MAX_PAGES: zod_1.z
            .string()
            .default('10')
            .transform((s) => parseInt(s, 10)),
        DATABASE_URL: zod_1.z.url().describe('PostgreSQL connection string'),
        POWERSYNC_URL: zod_1.z.url().describe('PowerSync service URL'),
        POWERSYNC_JWT_PRIVATE_KEY: zod_1.z
            .string()
            .describe('Base64 encoded private key for PowerSync JWT signing'),
        BETTER_AUTH_SECRET: zod_1.z.string(),
        BETTER_AUTH_URL: zod_1.z.url(),
        CORS_ORIGINS: zod_1.z
            .string()
            .default('http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000')
            .transform((s) => s.split(',').map((o) => o.trim()))
            .describe('Comma-separated list of allowed CORS origins'),
        ANTHROPIC_API_KEY: zod_1.z.string().describe('Anthropic API key for Claude'),
        GOOGLE_OAUTH_CLIENT_ID: zod_1.z.string().describe('Google OAuth2 client ID'),
        GOOGLE_OAUTH_CLIENT_SECRET: zod_1.z.string().describe('Google OAuth2 client secret'),
        GOOGLE_OAUTH_REFRESH_TOKEN: zod_1.z.string().describe('Google OAuth2 refresh token (generated once via OAuth Playground)'),
        GOOGLE_DRIVE_FOLDER_ID: zod_1.z.string().describe('Google Drive folder ID to upload files into'),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
//# sourceMappingURL=env.js.map
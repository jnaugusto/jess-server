import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { Pool } from 'pg';
import { env } from '../env';

// We'll create a standalone pool for the auth config if needed,
// or export a function that takes a pool.
export const createAuth = (pool: Pool) =>
  betterAuth({
    database: pool,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    plugins: [bearer()],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  });

export type Auth = ReturnType<typeof createAuth>;

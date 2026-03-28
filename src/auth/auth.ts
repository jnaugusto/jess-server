import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';
import { env } from '../env';

export const createAuth = (db: NodePgDatabase<typeof schema>) =>
  betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    trustedOrigins: [
      'https://api.jnaugusto.com',
      'capacitor://localhost',
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    plugins: [bearer()],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/auth',
  });

export type Auth = ReturnType<typeof createAuth>;

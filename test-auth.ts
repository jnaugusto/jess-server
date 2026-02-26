import { betterAuth } from 'better-auth';
export const auth = betterAuth({
  database: {
    dialect: "pg",
    type: "postgres",
  },
  emailAndPassword: {
    enabled: true,
  }
});

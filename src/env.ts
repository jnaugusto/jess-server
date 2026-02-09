import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .default('3000')
      .transform((s) => parseInt(s, 10)),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

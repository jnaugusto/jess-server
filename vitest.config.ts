import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Don't run global-setup for unit tests to avoid Docker dependency
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // One mongod for the whole file, torn down after: starting a fresh server
    // per test would dominate the runtime.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

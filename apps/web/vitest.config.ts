import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    /* Room for a slow worker to finish a wait that is itself allowed 3
       seconds — a test timeout below that fires first and reports a timeout
       instead of the real assertion. */
    testTimeout: 15_000,
    /*
     * One file at a time. Run in parallel, these suites contend for the CPU and
     * a portalled Mantine menu intermittently fails to appear inside the wait —
     * a failure that reads like a missing menu item and is really a busy
     * machine. The whole suite takes a few seconds either way.
     */
    fileParallelism: false,
  },
});
